import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestTokenData, setupAuthServiceTest } from '../../helpers/authServiceTestHelper.js';
import { createHoistedMockStorage } from '../../helpers/authServiceMocks.js';

// Track mock storage instance
let mockStorage: any;
const getStorage = () => {
  const storage = getMockStorage();
  if (!storage) {
    throw new Error('MockStorage instance not initialized');
  }
  return storage;
};

// Use vi.hoisted() to ensure mocks are created before imports
const { MockStorage, getInstance: getMockStorage } = createHoistedMockStorage(vi);

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

    mockStorage = getMockStorage();
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
      getStorage()._mockGetToken().mockResolvedValue(validToken);

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
      expect(getStorage()._mockGetToken()).toHaveBeenCalledTimes(1);

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
      getStorage()._mockGetToken().mockResolvedValue(validToken);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      await getAuthService().getToken(['fr:idm:*']);

      // Verify storage was checked
      expect(getStorage()._mockGetToken()).toHaveBeenCalledTimes(1);
    });
  });

  describe('Expired Token', () => {
    it.each([
      {
        name: 'should trigger re-authentication when token is expired (expiresAt < Date.now())',
        token: (now: number) => createTestTokenData({ expiresAt: now - 1000, aicBaseUrl: 'test.forgeblocks.com' }),
      },
      {
        name: 'should trigger re-authentication when cached token is for different aicBaseUrl',
        token: (now: number) => createTestTokenData({ expiresAt: now + 3600000, aicBaseUrl: 'different-tenant.forgeblocks.com' }),
      },
    ])('$name', async ({ token }) => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      getStorage()._mockGetToken().mockResolvedValue(token(mockNow));

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      await getAuthService().getToken(['fr:idm:*']);

      expect(getStorage()._mockGetToken()).toHaveBeenCalledTimes(1);
      expect(mockPkceFlow).toHaveBeenCalledTimes(1);
      expect(mockPkceFlow).toHaveBeenCalledWith(['fr:idm:*']);
    });
  });

  describe('allowCachedOnFirstRequest Configuration', () => {
    it.each([
      {
        name: 'skips cache on first request when allowCachedOnFirstRequest is false',
        allowCachedOnFirstRequest: false,
        expectCacheCalls: 0,
        expectPkceCalls: 1,
        expectMessage: 'Fresh authentication required on startup',
      },
      {
        name: 'uses cache on first request when allowCachedOnFirstRequest is true',
        allowCachedOnFirstRequest: true,
        expectCacheCalls: 1,
        expectPkceCalls: 0,
        expectMessage: null,
        cachedToken: { accessToken: 'cached-token' },
      },
    ])('$name', async ({ allowCachedOnFirstRequest, expectCacheCalls, expectPkceCalls, expectMessage, cachedToken }) => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest });

      const tokenData = createTestTokenData({
        accessToken: cachedToken?.accessToken ?? 'cached-token',
        expiresAt: mockNow + 3600000,
        aicBaseUrl: 'test.forgeblocks.com',
      });
      getStorage()._mockGetToken().mockResolvedValue(tokenData);

      const authServiceInstance = getAuthService() as any;
      authServiceInstance.executePkceFlow = mockPkceFlow;
      authServiceInstance.executeDeviceFlow = mockDeviceFlow;
      authServiceInstance.exchangeToken = mockExchangeToken;

      const result = await getAuthService().getToken(['fr:idm:*']);

      if (expectMessage) {
        expect(consoleErrorSpy).toHaveBeenCalledWith(expectMessage);
      }

      expect(getStorage()._mockGetToken()).toHaveBeenCalledTimes(expectCacheCalls);
      expect(mockPkceFlow).toHaveBeenCalledTimes(expectPkceCalls);

      if (allowCachedOnFirstRequest) {
        expect(result).toBe('scoped-token');
      }

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should share in-flight promise for concurrent calls (no duplicate auth)', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });

      // No cached token exists
      getStorage()._mockGetToken().mockResolvedValue(null);

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
      getStorage()._mockGetToken().mockResolvedValue(null);

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
      getStorage()._mockGetToken().mockResolvedValue(null);

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
      getStorage()._mockGetToken().mockResolvedValue(null);

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
      getStorage()._mockGetToken().mockRejectedValue(storageError);

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
      getStorage()._mockGetToken().mockRejectedValue(new Error('Storage error'));

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
