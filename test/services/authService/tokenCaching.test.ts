import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestTokenData, setupAuthServiceTest } from '../../helpers/authServiceTestHelper.js';

// Track mock storage instance
let mockStorage: any;

// Use vi.hoisted() to ensure mocks are created before imports
const { MockStorage } = vi.hoisted(() => {
  class MockStorage {
    private mockGetToken = vi.fn();
    private mockSetToken = vi.fn();
    private mockDeleteToken = vi.fn();

    constructor() {
      // Store reference to instance so tests can configure it
      mockStorage = this;
    }

    async getToken() {
      return this.mockGetToken();
    }

    async setToken(tokenData: any) {
      return this.mockSetToken(tokenData);
    }

    async deleteToken() {
      return this.mockDeleteToken();
    }

    // Test helper methods
    _mockGetToken() { return this.mockGetToken; }
    _mockSetToken() { return this.mockSetToken; }
    _mockDeleteToken() { return this.mockDeleteToken; }
  }

  return { MockStorage };
});

// Mock tokenStorage module to use our mock implementation
vi.mock('../../../src/services/tokenStorage.js', () => ({
  FileStorage: MockStorage,
  KeychainStorage: MockStorage,
}));

// Mock 'open' to prevent browser launching during tests
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Tests for AuthService token caching via getPrimaryToken()
 *
 * Tests the caching logic in getPrimaryToken() by calling it indirectly via getToken().
 * getPrimaryToken() handles:
 * - Retrieving cached tokens from storage
 * - Validating token expiry
 * - Validating token tenant (aicBaseUrl)
 * - Skipping cache on first request (if configured)
 * - Preventing concurrent authentication flows
 * - Handling storage errors gracefully
 */
describe('AuthService Token Caching', () => {
  setupAuthServiceTest();

  let mockPkceFlow: ReturnType<typeof vi.fn>;
  let mockDeviceFlow: ReturnType<typeof vi.fn>;
  let mockExchangeToken: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset modules to clear singleton instance
    vi.resetModules();

    // Create mock auth flow functions
    mockPkceFlow = vi.fn().mockResolvedValue('mock-access-token');
    mockDeviceFlow = vi.fn().mockResolvedValue('mock-access-token');
    mockExchangeToken = vi.fn().mockResolvedValue('scoped-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Valid Cached Token', () => {
    it('should return valid cached token without triggering authentication', async () => {
      // Mock Date.now() to control expiry checking
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      // Initialize auth service with cache enabled
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // Configure mock storage to return valid token (expires in future)
      const validToken = createTestTokenData({
        accessToken: 'cached-token',
        expiresAt: mockNow + 3600000, // Expires in 1 hour
        aicBaseUrl: 'test.forgeblocks.com',
      });
      mockStorage._mockGetToken().mockResolvedValue(validToken);

      // Mock auth flows and token exchange
      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      // Get token - should use cache
      const token = await getAuthService().getToken(['fr:idm:*']);

      // Should return scoped token (from exchange)
      expect(token).toBe('scoped-token');

      // Should check storage
      expect(mockStorage._mockGetToken()).toHaveBeenCalledTimes(1);

      // Should NOT trigger authentication
      expect(mockPkceFlow).not.toHaveBeenCalled();
      expect(mockDeviceFlow).not.toHaveBeenCalled();

      // Should exchange the cached token for scoped token
      expect(mockExchangeToken).toHaveBeenCalledWith('cached-token', ['fr:idm:*']);
    });

    it('should call storage.getToken() to check cache', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      // Initialize auth service
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      const validToken = createTestTokenData({
        expiresAt: mockNow + 3600000,
        aicBaseUrl: 'test.forgeblocks.com',
      });
      mockStorage._mockGetToken().mockResolvedValue(validToken);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      await getAuthService().getToken(['fr:idm:*']);

      // Verify storage was checked
      expect(mockStorage._mockGetToken()).toHaveBeenCalledTimes(1);
    });
  });

  describe('Expired Token', () => {
    it('should trigger re-authentication when token is expired (expiresAt < Date.now())', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // Mock storage to return expired token
      const expiredToken = createTestTokenData({
        expiresAt: mockNow - 1000, // Already expired
        aicBaseUrl: 'test.forgeblocks.com',
      });
      mockStorage._mockGetToken().mockResolvedValue(expiredToken);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      await getAuthService().getToken(['fr:idm:*']);

      // Should check storage
      expect(mockStorage._mockGetToken()).toHaveBeenCalledTimes(1);

      // Should trigger PKCE flow (default mode)
      expect(mockPkceFlow).toHaveBeenCalledTimes(1);
      expect(mockPkceFlow).toHaveBeenCalledWith(['fr:idm:*']);
    });
  });

  describe('Different Tenant Token', () => {
    it('should trigger re-authentication when cached token is for different aicBaseUrl', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      // Mock console.error to verify error message
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // Token is valid but for different tenant
      const differentTenantToken = createTestTokenData({
        expiresAt: mockNow + 3600000, // Valid expiry
        aicBaseUrl: 'different-tenant.forgeblocks.com', // Different tenant
      });
      mockStorage._mockGetToken().mockResolvedValue(differentTenantToken);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      await getAuthService().getToken(['fr:idm:*']);

      // Should log error message about different tenant
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cached token is for different tenant')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('different-tenant.forgeblocks.com')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('test.forgeblocks.com')
      );

      // Should trigger PKCE flow
      expect(mockPkceFlow).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('allowCachedOnFirstRequest Configuration', () => {
    it('should skip cache on first request when allowCachedOnFirstRequest is false', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      // Mock console.error to verify error message
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: false });

      // Valid cached token exists
      const validToken = createTestTokenData({
        expiresAt: mockNow + 3600000,
        aicBaseUrl: 'test.forgeblocks.com',
      });
      mockStorage._mockGetToken().mockResolvedValue(validToken);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      // First call should skip cache
      await getAuthService().getToken(['fr:idm:*']);

      // Should log fresh authentication message
      expect(consoleErrorSpy).toHaveBeenCalledWith('Fresh authentication required on startup');

      // Should NOT check storage
      expect(mockStorage._mockGetToken()).not.toHaveBeenCalled();

      // Should trigger PKCE flow
      expect(mockPkceFlow).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });

    it('should use cache on first request when allowCachedOnFirstRequest is true', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // Valid cached token exists
      const validToken = createTestTokenData({
        accessToken: 'cached-token',
        expiresAt: mockNow + 3600000,
        aicBaseUrl: 'test.forgeblocks.com',
      });
      mockStorage._mockGetToken().mockResolvedValue(validToken);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      // First call should use cache
      const token = await getAuthService().getToken(['fr:idm:*']);

      // Should return scoped token (from exchange)
      expect(token).toBe('scoped-token');

      // Should check storage
      expect(mockStorage._mockGetToken()).toHaveBeenCalledTimes(1);

      // Should NOT trigger PKCE flow
      expect(mockPkceFlow).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should share in-flight promise for concurrent calls (no duplicate auth)', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // No cached token exists
      mockStorage._mockGetToken().mockResolvedValue(null);

      // Mock PKCE flow with delay to simulate async behavior
      let resolveAuthFlow: (value: string) => void;
      const authFlowPromise = new Promise<string>((resolve) => {
        resolveAuthFlow = resolve;
      });
      mockPkceFlow.mockReturnValue(authFlowPromise);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      // Start two concurrent getToken calls
      const promise1 = getAuthService().getToken(['fr:idm:*']);
      const promise2 = getAuthService().getToken(['fr:idm:*']);

      // Resolve the auth flow
      resolveAuthFlow!('mock-access-token');

      // Wait for both promises
      const [token1, token2] = await Promise.all([promise1, promise2]);

      // Both should return the scoped token (from exchange)
      expect(token1).toBe('scoped-token');
      expect(token2).toBe('scoped-token');

      // PKCE flow should only be called ONCE (shared in-flight promise)
      expect(mockPkceFlow).toHaveBeenCalledTimes(1);
    });

    it('should clear in-flight promise after authentication completes', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // No cached token exists
      mockStorage._mockGetToken().mockResolvedValue(null);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      // First call completes authentication
      await getAuthService().getToken(['fr:idm:*']);

      // Should have called PKCE flow once
      expect(mockPkceFlow).toHaveBeenCalledTimes(1);

      // Reset mock and storage for second call
      mockPkceFlow.mockClear();
      mockStorage._mockGetToken().mockResolvedValue(null);

      // Second call should trigger new authentication (not use cleared promise)
      await getAuthService().getToken(['fr:idm:*']);

      // Should have called PKCE flow again
      expect(mockPkceFlow).toHaveBeenCalledTimes(1);
    });
  });

  describe('State Tracking', () => {
    it('should set hasAuthenticatedThisSession after first authentication', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // No cached token exists
      mockStorage._mockGetToken().mockResolvedValue(null);

      const authServiceInstance = getAuthService() as any;
      mockPkceFlow.mockImplementation(async (scopes: string[]) => {
        authServiceInstance.hasAuthenticatedThisSession = true;
        return 'mock-access-token';
      });
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      await getAuthService().getToken(['fr:idm:*']);

      expect(authServiceInstance.hasAuthenticatedThisSession).toBe(true);
    });
  });

  describe('Storage Error Handling', () => {
    it('should handle storage errors gracefully and trigger authentication', async () => {
      // Mock console.error to verify error logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // Mock storage to throw error
      const storageError = new Error('Keychain access denied');
      mockStorage._mockGetToken().mockRejectedValue(storageError);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      await getAuthService().getToken(['fr:idm:*']);

      // Should log storage error
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error accessing token storage:', storageError);

      // Should still trigger PKCE flow
      expect(mockPkceFlow).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });

    it('should successfully authenticate after storage error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // Mock storage to throw error
      mockStorage._mockGetToken().mockRejectedValue(new Error('Storage error'));

      mockPkceFlow.mockResolvedValue('fresh-token');

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      const token = await getAuthService().getToken(['fr:idm:*']);

      // Should return scoped token (from exchange)
      expect(token).toBe('scoped-token');

      consoleErrorSpy.mockRestore();
    });
  });
});
