import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import {
  setupAuthServiceTest,
  MOCK_TOKEN_RESPONSE,
} from '../../helpers/authServiceTestHelper.js';

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
 * Tests for AuthService RFC 8693 Token Exchange
 *
 * Tests the token exchange implementation in exchangeToken() and getToken(), including:
 * - RFC 8693 request format (grant_type, subject_token, requested_token_type, scope, client_id)
 * - Response parsing (extracting access_token)
 * - Error handling and logging
 */
describe('AuthService Token Exchange', () => {
  setupAuthServiceTest();

  beforeEach(async () => {
    // Set local mode (NOT container mode)
    process.env.DOCKER_CONTAINER = 'false';

    // Reset modules to clear singleton instance
    vi.resetModules();

    // Clear prior mockStorage reference (new instance created on initAuthService)
    mockStorage = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function primeStorageWithValidToken() {
    if (!mockStorage) {
      throw new Error('MockStorage instance not initialized');
    }

    // Reset spy calls between tests
    mockStorage._mockGetToken().mockReset();
    mockStorage._mockSetToken().mockReset();
    mockStorage._mockDeleteToken().mockReset();

    // Return valid cached token (so getPrimaryToken returns immediately)
    mockStorage._mockGetToken().mockResolvedValue({
      accessToken: 'mock-primary-token',
      expiresAt: Date.now() + 3600000, // Valid for 1 hour
      aicBaseUrl: 'test.forgeblocks.com',
    });
    mockStorage._mockSetToken().mockResolvedValue(undefined);
  }

  describe('Request Construction', () => {
    it('should build token exchange request with all required parameters', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });
      primeStorageWithValidToken();

      let capturedParams: URLSearchParams | undefined;

      server.use(
        http.post('https://test.forgeblocks.com/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:token-exchange') {
            capturedParams = params;
            return HttpResponse.json({
              access_token: 'exchanged-token',
              expires_in: 3600,
              token_type: 'Bearer',
            });
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      await getAuthService().getToken(['scope:one', 'scope:two', 'scope:three']);

      expect(capturedParams).toBeDefined();
      expect(capturedParams!.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
      expect(capturedParams!.get('subject_token')).toBe('mock-primary-token');
      expect(capturedParams!.get('requested_token_type')).toBe('urn:ietf:params:oauth:token-type:access_token');
      expect(capturedParams!.get('scope')).toBe('scope:one scope:two scope:three');
      expect(capturedParams!.get('client_id')).toBe('AICMCPExchangeClient');
    });
  });

  describe('Response Processing', () => {
    it('should extract access_token field from response', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });
      primeStorageWithValidToken();

      server.use(
        http.post('https://test.forgeblocks.com/am/oauth2/access_token', ({ request }) => {
          const body = request.clone();
          return HttpResponse.json({
            access_token: 'exchanged-token',
            expires_in: 3600,
            token_type: 'Bearer',
          });
        })
      );

      const result = await getAuthService().getToken(['fr:idm:*']);
      expect(result).toBe('exchanged-token');
    });

    it('should return only the token string (not full response)', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });
      primeStorageWithValidToken();

      server.use(
        http.post('https://test.forgeblocks.com/am/oauth2/access_token', () => {
          return HttpResponse.json({
            access_token: 'just-the-token',
            expires_in: 3600,
            token_type: 'Bearer',
            extra: 'ignored-field',
          });
        })
      );

      const result = await getAuthService().getToken(['fr:idm:*']);
      expect(result).toBe('just-the-token');
    });

    it('should handle missing access_token field', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });
      primeStorageWithValidToken();

      server.use(
        http.post('https://test.forgeblocks.com/am/oauth2/access_token', () => {
          return HttpResponse.json({
            // access_token intentionally omitted
            expires_in: 3600,
            token_type: 'Bearer',
          });
        })
      );

      const result = await getAuthService().getToken(['fr:idm:*']);
      expect(result).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should catch HTTP errors and wrap them', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });
      primeStorageWithValidToken();

      server.use(
        http.post('https://test.forgeblocks.com/am/oauth2/access_token', () => {
          return new HttpResponse('boom', { status: 500 });
        })
      );

      await expect(getAuthService().getToken(['fr:idm:*'])).rejects.toThrow(
        'Token exchange failed (500 Internal Server Error): boom'
      );
    });

    it('should propagate network errors', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });
      primeStorageWithValidToken();

      server.use(
        http.post('https://test.forgeblocks.com/am/oauth2/access_token', () => {
          throw new Error('network down');
        })
      );

      await expect(getAuthService().getToken(['fr:idm:*'])).rejects.toThrow('network down');
    });

    it('should retry once on 401 then succeed', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });
      primeStorageWithValidToken();

      let exchangeCalls = 0;

      server.use(
        http.post('https://test.forgeblocks.com/am/oauth2/access_token', () => {
          exchangeCalls += 1;

          if (exchangeCalls === 1) {
            return new HttpResponse('unauthorized', { status: 401 });
          }

          return HttpResponse.json({
            access_token: 'exchanged-after-retry',
            expires_in: 3600,
            token_type: 'Bearer',
          });
        })
      );

      const token = await getAuthService().getToken(['fr:idm:*']);

      expect(exchangeCalls).toBe(2);
      expect(token).toBe('exchanged-after-retry');
    });

    it('should log when token exchange fails', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { allowCachedOnFirstRequest: true });
      primeStorageWithValidToken();

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      server.use(
        http.post('https://test.forgeblocks.com/am/oauth2/access_token', () => {
          return new HttpResponse('boom', { status: 500 });
        })
      );

      await expect(getAuthService().getToken(['fr:idm:*'])).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Token exchange: requesting scopes [fr:idm:*]'
      );
    });
  });
});
