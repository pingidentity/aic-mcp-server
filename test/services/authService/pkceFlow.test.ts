import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import {
  setupAuthServiceTest,
  MOCK_TOKEN_RESPONSE,
} from '../../helpers/authServiceTestHelper.js';
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

// Mock http module for createServer
const mockServerInstance = {
  listen: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
};

let mockRequestHandler: any = null;

vi.mock('http', () => ({
  createServer: vi.fn((handler) => {
    mockRequestHandler = handler;
    return mockServerInstance;
  }),
}));

/**
 * Tests for AuthService OAuth 2.0 PKCE Flow
 *
 * Tests the PKCE flow implementation in executePkceFlow(), including:
 * - PKCE challenge generation (verifier and challenge)
 * - Authorization URL construction
 * - HTTP server lifecycle
 * - Authorization code extraction
 * - Token exchange with PKCE verifier
 * - Token storage after successful authentication
 * - Error handling and cleanup
 */
describe('AuthService PKCE Flow', () => {
  setupAuthServiceTest();

  beforeEach(async () => {
    // Set local mode (NOT container mode)
    process.env.DOCKER_CONTAINER = 'false';

    // Reset modules to clear singleton instance
    vi.resetModules();

    // Mock storage to return null (no cached token)
    mockStorage = getMockStorage();
    if (mockStorage) {
      // Reset spy calls between tests
      mockStorage._mockGetToken().mockReset();
      mockStorage._mockSetToken().mockReset();
      mockStorage._mockDeleteToken().mockReset();

      mockStorage._mockGetToken().mockResolvedValue(null);
      mockStorage._mockSetToken().mockResolvedValue(undefined);
    }

    // Reset mock server
    mockServerInstance.listen.mockReset();
    mockServerInstance.close.mockReset();
    mockServerInstance.on.mockReset();
    mockRequestHandler = null;

    // Configure mock server behavior
    mockServerInstance.listen.mockImplementation((_port: number, callback?: () => void) => {
      if (callback) callback();
    });
    mockServerInstance.close.mockImplementation(() => {
      // Server closes successfully
    });
    mockServerInstance.on.mockImplementation((_event: string, _handler: any) => {
      // Store error handler but don't call it unless test triggers it
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PKCE Challenge Generation', () => {
    it('should generate PKCE verifier and challenge correctly', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let codeChallenge: string | null = null;
      let codeVerifier: string | null = null;

      const openModule = await import('open');

      server.use(
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          // Only capture from authorization_code grant (not token exchange)
          if (params.get('grant_type') === 'authorization_code') {
            codeVerifier = params.get('code_verifier');
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      // Extract code_challenge
      const authUrl = (openModule.default as any).mock.calls[0][0];
      const url = new URL(authUrl);
      codeChallenge = url.searchParams.get('code_challenge');

      // Simulate OAuth redirect
      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      // Verify PKCE relationship: challenge = SHA256(verifier)
      expect(codeChallenge).toBeTruthy();
      expect(codeVerifier).toBeTruthy();
      expect(codeVerifier!.length).toBe(43);
      expect(codeVerifier!).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);

      const crypto = await import('crypto');
      const expectedChallenge = crypto.createHash('sha256')
        .update(codeVerifier!)
        .digest('base64url');
      expect(codeChallenge).toBe(expectedChallenge);
    });

    it('should generate unique verifiers on multiple calls', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      const verifiers: string[] = [];

      server.use(
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);
          const verifier = params.get('code_verifier');
          if (verifier) verifiers.push(verifier);
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      // First call
      const promise1 = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq1 = { url: 'http://localhost:3000?code=test-auth-code-1' };
      const mockRes1 = { end: vi.fn() };
      mockRequestHandler(mockReq1, mockRes1);

      await promise1;

      // Reset modules for second call
      vi.resetModules();
      mockServerInstance.listen.mockReset();
      mockServerInstance.close.mockReset();

      // Second call
      const { initAuthService: init2, getAuthService: get2 } = await import('../../../src/services/authService.js');
      init2(['fr:idm:*'], {});
      const promise2 = get2().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq2 = { url: 'http://localhost:3000?code=test-auth-code-2' };
      const mockRes2 = { end: vi.fn() };
      mockRequestHandler(mockReq2, mockRes2);

      await promise2;

      // Verifiers should be different
      expect(verifiers).toHaveLength(2);
      expect(verifiers[0]).not.toBe(verifiers[1]);
    });
  });

  describe('Authorization URL Construction', () => {
    it('should include all required parameters in authorization URL', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*', 'fr:idc:esv:*', 'other:scope'], {});

      const openModule = await import('open');

      const tokenPromise = getAuthService().getToken(['fr:idm:*', 'fr:idc:esv:*', 'other:scope']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const authUrl = (openModule.default as any).mock.calls[0][0];
      const url = new URL(authUrl);

      expect(url.searchParams.get('client_id')).toBe('AICMCPClient');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).toBe('fr:idm:* fr:idc:esv:* other:scope');
      expect(url.hostname).toBe('test.forgeblocks.com');
      expect(url.pathname).toBe('/am/oauth2/authorize');

      // Clean up
      const mockReq = { url: 'http://localhost:3000?code=test-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      await tokenPromise;
    });
  });

  describe('Code Exchange', () => {
    it('should POST to TOKEN_URL', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let capturedRequest: Request | undefined;

      server.use(
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          capturedRequest = request.clone();
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest!.method).toBe('POST');
      expect(capturedRequest!.url).toContain('/am/oauth2/access_token');
    });

    it('should include grant_type=authorization_code', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let capturedParams: URLSearchParams | undefined;

      server.use(
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          // Only capture from authorization_code grant (not token exchange)
          if (params.get('grant_type') === 'authorization_code') {
            capturedParams = params;
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      expect(capturedParams).toBeDefined();
      expect(capturedParams!.get('grant_type')).toBe('authorization_code');
    });

    it('should include code, redirect_uri, and client_id', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let capturedParams: URLSearchParams | undefined;

      server.use(
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          // Only capture from authorization_code grant (not token exchange)
          if (params.get('grant_type') === 'authorization_code') {
            capturedParams = params;
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      expect(capturedParams).toBeDefined();
      expect(capturedParams!.get('code')).toBe('test-auth-code');
      expect(capturedParams!.get('redirect_uri')).toBe('http://localhost:3000');
      expect(capturedParams!.get('client_id')).toBe('AICMCPClient');
    });

    it('should include code_verifier for PKCE', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let capturedParams: URLSearchParams | undefined;

      server.use(
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          // Only capture from authorization_code grant (not token exchange)
          if (params.get('grant_type') === 'authorization_code') {
            capturedParams = params;
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      expect(capturedParams).toBeDefined();
      expect(capturedParams!.get('code_verifier')).toBeTruthy();
      expect(capturedParams!.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should parse access_token and expires_in from response', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      const customTokenResponse = {
        access_token: 'custom-access-token',
        expires_in: 7200,
        token_type: 'Bearer',
      };

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(customTokenResponse);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      // Verify token was stored with correct values
      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'custom-access-token',
        })
      );
    });

    it('should throw descriptive error on token exchange failure', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return new HttpResponse('Invalid authorization code', { status: 400 });
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await expect(tokenPromise).rejects.toThrow(
        'Authorization code exchange failed (400 Bad Request): Invalid authorization code'
      );
    });
  });

  describe('Token Storage', () => {
    it('should call storage.setToken() after successful exchange', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledTimes(1);
    });

    it('should store token with accessToken, expiresAt, and aicBaseUrl', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledWith({
        accessToken: MOCK_TOKEN_RESPONSE.access_token,
        expiresAt: mockNow + (MOCK_TOKEN_RESPONSE.expires_in * 1000),
        aicBaseUrl: 'test.forgeblocks.com',
      });
    });

    it('should calculate expiresAt from expires_in', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const customTokenResponse = {
        access_token: 'test-token',
        expires_in: 7200, // 2 hours
        token_type: 'Bearer',
      };

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(customTokenResponse);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: mockNow + 7200000, // 2 hours in milliseconds
        })
      );
    });

    it('should set hasAuthenticatedThisSession to true', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      // Access internal state
      const authService = getAuthService() as any;
      expect(authService.hasAuthenticatedThisSession).toBe(true);
    });
  });

  describe('Server Lifecycle', () => {
    it('should start HTTP server on port 3000', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      expect(mockServerInstance.listen).toHaveBeenCalledWith(3000, expect.any(Function));

      // Clean up
      const mockReq = { url: 'http://localhost:3000?code=test-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;
    });

    it('should extract code parameter from query string', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let capturedCode: string | null = null;

      server.use(
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          // Only capture from authorization_code grant (not token exchange)
          if (params.get('grant_type') === 'authorization_code') {
            capturedCode = params.get('code');
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=my-special-auth-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      expect(capturedCode).toBe('my-special-auth-code');
    });

    it('should close server after receiving code', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      expect(mockServerInstance.close).toHaveBeenCalled();
    });

    it('should close server on error (no code parameter)', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      // Simulate redirect without code parameter
      const mockReq = { url: 'http://localhost:3000?error=access_denied' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await expect(tokenPromise).rejects.toThrow('Authorization code not found in redirect.');
      expect(mockServerInstance.close).toHaveBeenCalled();
    });

    it('should close server on server error', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let errorHandler: any = null;

      mockServerInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === 'error') {
          errorHandler = handler;
        }
      });

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      // Trigger server error
      expect(errorHandler).toBeDefined();
      errorHandler(new Error('Port already in use'));

      await expect(tokenPromise).rejects.toThrow('Port already in use');
      expect(mockServerInstance.close).toHaveBeenCalled();
    });

    it('should clear redirectServer reference after completion', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      // Access internal state
      const authService = getAuthService() as any;
      expect(authService.redirectServer).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should propagate server errors', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let errorHandler: any = null;

      mockServerInstance.on.mockImplementation((event: string, handler: any) => {
        if (event === 'error') {
          errorHandler = handler;
        }
      });

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      errorHandler(new Error('Server startup failed'));

      await expect(tokenPromise).rejects.toThrow('Server startup failed');
    });

    it('should propagate token exchange errors', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return new HttpResponse('Token exchange failed', { status: 500 });
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await expect(tokenPromise).rejects.toThrow(
        'Authorization code exchange failed (500 Internal Server Error): Token exchange failed'
      );
    });

    it('should log errors on token exchange failure', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      server.use(
        http.post('https://*/am/oauth2/access_token', () => {
          return new HttpResponse('Token exchange failed', { status: 500 });
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      const mockReq = { url: 'http://localhost:3000?code=test-code' };
      const mockRes = { end: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await expect(tokenPromise).rejects.toThrow();

      const errorCall = consoleErrorSpy.mock.calls.find(
        (call) => call[0] === 'User authentication failed:' && call[1] instanceof Error
      );
      expect(errorCall).toBeDefined();
    });
  });
});
