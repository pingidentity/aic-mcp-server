import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import { setupAuthServiceTest, MOCK_TOKEN_RESPONSE } from '../../helpers/authServiceTestHelper.js';
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
  KeychainStorage: MockStorage
}));

// Create a persistent mock for 'open' that we can access
const mockOpen = vi.fn().mockResolvedValue(undefined);

// Mock 'open' to prevent browser launching during tests
vi.mock('open', () => ({
  default: mockOpen
}));

// Mock http module for createServer
const mockServerInstance = {
  listen: vi.fn(),
  close: vi.fn(),
  on: vi.fn()
};

let mockRequestHandler: any = null;

vi.mock('http', () => ({
  createServer: vi.fn((handler) => {
    mockRequestHandler = handler;
    return mockServerInstance;
  })
}));

// Helper to create mock request/response objects with proper headers
function createMockRedirect(url: string) {
  return {
    req: {
      url,
      headers: { referer: 'https://test.forgeblocks.com/am/oauth2/authorize' }
    },
    res: {
      end: vi.fn(),
      writeHead: vi.fn()
    }
  };
}

/**
 * Helper to set up PKCE flow and extract state parameter
 * Reduces boilerplate in tests that need to send custom redirects
 */
async function setupPkceFlowTest(
  options: {
    setupTokenEndpoint?: boolean;
    scopes?: string[];
    tokenResponse?: any;
    customTokenHandler?: (request: Request) => Response | Promise<Response>;
  } = {}
) {
  const scopes = options.scopes || ['fr:idm:*'];

  vi.resetModules();
  const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
  initAuthService(scopes, {});

  // Setup MSW token endpoint handler if requested
  if (options.setupTokenEndpoint) {
    server.use(
      http.post('https://*/am/oauth2/access_token', () => {
        return HttpResponse.json(options.tokenResponse || MOCK_TOKEN_RESPONSE);
      })
    );
  } else if (options.customTokenHandler) {
    server.use(http.post('https://*/am/oauth2/access_token', ({ request }) => options.customTokenHandler!(request)));
  }

  // Start authentication flow
  const tokenPromise = getAuthService().getToken(scopes);
  await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

  // Extract state and authUrl from authorization URL
  const openModule = await import('open');
  const authUrl = (openModule.default as any).mock.calls[0][0];
  const url = new URL(authUrl);
  const state = url.searchParams.get('state')!;

  /**
   * Send a mock OAuth redirect with custom headers
   */
  const sendRedirect = (headers: Record<string, string> = {}, code = 'test-auth-code') => {
    const mockReq = {
      url: `http://localhost:3000?code=${code}&state=${state}`,
      headers
    };
    const mockRes = { end: vi.fn(), writeHead: vi.fn() };
    mockRequestHandler(mockReq, mockRes);
    return { mockReq, mockRes };
  };

  return { tokenPromise, state, sendRedirect, authUrl, url, getAuthService };
}

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

    // Reset 'open' mock calls
    mockOpen.mockClear();

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
      vi.resetModules();
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

      // Extract code_challenge and state
      const authUrl = (openModule.default as any).mock.calls[0][0];
      const url = new URL(authUrl);
      codeChallenge = url.searchParams.get('code_challenge');
      const state = url.searchParams.get('state');

      // Simulate OAuth redirect with state parameter
      const { req: mockReq, res: mockRes } = createMockRedirect(
        `http://localhost:3000?code=test-auth-code&state=${state}`
      );
      mockRequestHandler(mockReq, mockRes);

      await tokenPromise;

      // Verify PKCE relationship: challenge = SHA256(verifier)
      expect(codeChallenge).toBeTruthy();
      expect(codeVerifier).toBeTruthy();
      expect(codeVerifier!.length).toBe(43);
      expect(codeVerifier!).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);

      const crypto = await import('crypto');
      const expectedChallenge = crypto.createHash('sha256').update(codeVerifier!).digest('base64url');
      expect(codeChallenge).toBe(expectedChallenge);
    });

    it('should generate unique verifiers on multiple calls', async () => {
      vi.resetModules();
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

      // Extract state from first authorization URL
      const openModule = await import('open');
      let authUrl = (openModule.default as any).mock.calls[0][0];
      let url = new URL(authUrl);
      const state1 = url.searchParams.get('state');

      const { req: mockReq1, res: mockRes1 } = createMockRedirect(
        `http://localhost:3000?code=test-auth-code-1&state=${state1}`
      );
      mockRequestHandler(mockReq1, mockRes1);

      await promise1;

      // Reset modules for second call
      vi.resetModules();
      mockServerInstance.listen.mockReset();
      mockServerInstance.close.mockReset();

      // Reconfigure mock server after reset
      mockServerInstance.listen.mockImplementation((_port: number, callback?: () => void) => {
        if (callback) callback();
      });

      // Second call
      const { initAuthService: init2, getAuthService: get2 } = await import('../../../src/services/authService.js');
      init2(['fr:idm:*'], {});
      const promise2 = get2().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      // Wait for second open call
      await vi.waitFor(() => expect(mockOpen.mock.calls.length).toBe(2));

      // Extract state from second authorization URL
      authUrl = mockOpen.mock.calls[1][0];
      url = new URL(authUrl);
      const state2 = url.searchParams.get('state');

      const { req: mockReq2, res: mockRes2 } = createMockRedirect(
        `http://localhost:3000?code=test-auth-code-2&state=${state2}`
      );
      mockRequestHandler(mockReq2, mockRes2);

      await promise2;

      // Verifiers should be different
      expect(verifiers).toHaveLength(2);
      expect(verifiers[0]).not.toBe(verifiers[1]);
    });
  });

  describe('Authorization URL Construction', () => {
    it('should include all required parameters in authorization URL', async () => {
      const { tokenPromise, url, sendRedirect } = await setupPkceFlowTest({
        setupTokenEndpoint: true,
        scopes: ['fr:idm:*', 'fr:idc:esv:*', 'other:scope']
      });

      expect(url.searchParams.get('client_id')).toBe('AICMCPClient');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).toBe('fr:idm:* fr:idc:esv:* other:scope');
      expect(url.searchParams.get('state')).toBeTruthy();
      expect(url.hostname).toBe('test.forgeblocks.com');
      expect(url.pathname).toBe('/am/oauth2/authorize');

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;
    });
  });

  describe('Code Exchange', () => {
    it('should POST to TOKEN_URL', async () => {
      let capturedRequest: Request | undefined;

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        customTokenHandler: async (request) => {
          capturedRequest = request.clone();
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        }
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest!.method).toBe('POST');
      expect(capturedRequest!.url).toContain('/am/oauth2/access_token');
    });

    it('should include grant_type=authorization_code', async () => {
      let capturedParams: URLSearchParams | undefined;

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        customTokenHandler: async (request) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'authorization_code') {
            capturedParams = params;
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        }
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      expect(capturedParams).toBeDefined();
      expect(capturedParams!.get('grant_type')).toBe('authorization_code');
    });

    it('should include code, redirect_uri, and client_id', async () => {
      let capturedParams: URLSearchParams | undefined;

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        customTokenHandler: async (request) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'authorization_code') {
            capturedParams = params;
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        }
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      expect(capturedParams).toBeDefined();
      expect(capturedParams!.get('code')).toBe('test-auth-code');
      expect(capturedParams!.get('redirect_uri')).toBe('http://localhost:3000');
      expect(capturedParams!.get('client_id')).toBe('AICMCPClient');
    });

    it('should include code_verifier for PKCE', async () => {
      let capturedParams: URLSearchParams | undefined;

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        customTokenHandler: async (request) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'authorization_code') {
            capturedParams = params;
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        }
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      expect(capturedParams).toBeDefined();
      expect(capturedParams!.get('code_verifier')).toBeTruthy();
      expect(capturedParams!.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should parse access_token and expires_in from response', async () => {
      const customTokenResponse = {
        access_token: 'custom-access-token',
        expires_in: 7200,
        token_type: 'Bearer'
      };

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        setupTokenEndpoint: true,
        tokenResponse: customTokenResponse
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'custom-access-token'
        })
      );
    });

    it('should throw descriptive error on token exchange failure', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        customTokenHandler: () => {
          return new HttpResponse('Invalid authorization code', { status: 400 });
        }
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });

      await expect(tokenPromise).rejects.toThrow(
        'Authorization code exchange failed (400 Bad Request): Invalid authorization code'
      );
    });
  });

  describe('Token Storage', () => {
    it('should call storage.setToken() after successful exchange', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledTimes(1);
    });

    it('should store token with accessToken, expiresAt, and aicBaseUrl', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledWith({
        accessToken: MOCK_TOKEN_RESPONSE.access_token,
        expiresAt: mockNow + MOCK_TOKEN_RESPONSE.expires_in * 1000,
        aicBaseUrl: 'test.forgeblocks.com'
      });
    });

    it('should calculate expiresAt from expires_in', async () => {
      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const customTokenResponse = {
        access_token: 'test-token',
        expires_in: 7200, // 2 hours
        token_type: 'Bearer'
      };

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        setupTokenEndpoint: true,
        tokenResponse: customTokenResponse
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: mockNow + 7200000 // 2 hours in milliseconds
        })
      );
    });

    it('should set hasAuthenticatedThisSession to true', async () => {
      const { tokenPromise, sendRedirect, getAuthService } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      const authService = getAuthService() as any;
      expect(authService.hasAuthenticatedThisSession).toBe(true);
    });
  });

  describe('Server Lifecycle', () => {
    it('should start HTTP server on port 3000', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      expect(mockServerInstance.listen).toHaveBeenCalledWith(3000, expect.any(Function));

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' }, 'test-code');
      await tokenPromise;
    });

    it('should extract code parameter from query string', async () => {
      let capturedCode: string | null = null;

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        customTokenHandler: async (request) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'authorization_code') {
            capturedCode = params.get('code');
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        }
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' }, 'my-special-auth-code');
      await tokenPromise;

      expect(capturedCode).toBe('my-special-auth-code');
    });

    it('should close server after receiving code', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      expect(mockServerInstance.close).toHaveBeenCalled();
    });

    it.each([
      {
        name: 'should close server on error (no state parameter)',
        trigger: async (tokenPromise: Promise<any>) => {
          const mockReq = {
            url: 'http://localhost:3000?code=test-code',
            headers: { referer: 'https://test.forgeblocks.com/am/oauth2/authorize' }
          };
          const mockRes = { end: vi.fn(), writeHead: vi.fn() };
          mockRequestHandler(mockReq, mockRes);
          await expect(tokenPromise).rejects.toThrow('CSRF protection failed: state parameter missing');
        },
        expectClose: true
      },
      {
        name: 'should close server on error (invalid state parameter)',
        needsState: true,
        trigger: async (tokenPromise: Promise<any>) => {
          const mockReq = {
            url: 'http://localhost:3000?code=test-code&state=invalid-state',
            headers: { referer: 'https://test.forgeblocks.com/am/oauth2/authorize' }
          };
          const mockRes = { end: vi.fn(), writeHead: vi.fn() };
          mockRequestHandler(mockReq, mockRes);
          await expect(tokenPromise).rejects.toThrow('CSRF protection failed: state mismatch');
        },
        expectClose: true
      },
      {
        name: 'should close server on error (no code parameter)',
        needsState: true,
        trigger: async (tokenPromise: Promise<any>, _: any, state: string) => {
          const { req: mockReq, res: mockRes } = createMockRedirect(
            `http://localhost:3000?error=access_denied&state=${state}`
          );
          mockRequestHandler(mockReq, mockRes);
          await expect(tokenPromise).rejects.toThrow('Authorization code not found in redirect.');
        },
        expectClose: true
      },
      {
        name: 'should close server on server error',
        setupErrorHandler: true,
        trigger: async (_: Promise<any>, errorHandler: any) => {
          errorHandler(new Error('Port already in use'));
        },
        expectedMessage: 'Port already in use',
        expectClose: true
      },
      {
        name: 'should propagate server errors',
        setupErrorHandler: true,
        trigger: async (_: Promise<any>, errorHandler: any) => {
          errorHandler(new Error('Server startup failed'));
        },
        expectedMessage: 'Server startup failed',
        expectClose: false
      }
    ])('$name', async ({ setupErrorHandler, trigger, expectedMessage, expectClose, needsState }) => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], {});

      let errorHandler: any = null;
      if (setupErrorHandler) {
        mockServerInstance.on.mockImplementation((event: string, handler: any) => {
          if (event === 'error') {
            errorHandler = handler;
          }
        });
      }

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockServerInstance.listen).toHaveBeenCalled());

      let state: string = '';
      if (needsState) {
        // Extract state from authorization URL
        const openModule = await import('open');
        const authUrl = (openModule.default as any).mock.calls[0][0];
        const url = new URL(authUrl);
        state = url.searchParams.get('state') || '';
      }

      await trigger(tokenPromise, errorHandler, state);

      if (expectedMessage) {
        await expect(tokenPromise).rejects.toThrow(expectedMessage);
      }
      if (expectClose) {
        expect(mockServerInstance.close).toHaveBeenCalled();
      }
    });

    it('should clear redirectServer reference after completion', async () => {
      const { tokenPromise, sendRedirect, getAuthService } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await tokenPromise;

      const authService = getAuthService() as any;
      expect(authService.redirectServer).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should propagate token exchange errors', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        customTokenHandler: () => {
          return new HttpResponse('Token exchange failed', { status: 500 });
        }
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });

      await expect(tokenPromise).rejects.toThrow(
        'Authorization code exchange failed (500 Internal Server Error): Token exchange failed'
      );
    });

    it('should log errors on token exchange failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({
        customTokenHandler: () => {
          return new HttpResponse('Token exchange failed', { status: 500 });
        }
      });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });
      await expect(tokenPromise).rejects.toThrow();

      const errorCall = consoleErrorSpy.mock.calls.find(
        (call) => call[0] === 'User authentication failed:' && call[1] instanceof Error
      );
      expect(errorCall).toBeDefined();
    });
  });

  describe('Origin Validation', () => {
    it('should accept request with valid referer header', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });

      await expect(tokenPromise).resolves.toBeDefined();
      expect(mockServerInstance.close).toHaveBeenCalled();
    });

    it('should accept request with valid origin header', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({ origin: 'https://test.forgeblocks.com' });

      await expect(tokenPromise).resolves.toBeDefined();
      expect(mockServerInstance.close).toHaveBeenCalled();
    });

    it('should accept request with no origin/referer headers (lenient mode)', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({});

      await expect(tokenPromise).resolves.toBeDefined();
      expect(mockServerInstance.close).toHaveBeenCalled();
    });

    it('should reject request with invalid hostname', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest();

      const { mockRes } = sendRedirect({ referer: 'https://evil.attacker.com/am/oauth2/authorize' });

      await expect(tokenPromise).rejects.toThrow('Origin validation failed: hostname mismatch');
      expect(mockServerInstance.close).toHaveBeenCalled();
      expect(mockRes.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'text/html; charset=utf-8' });
    });

    it('should reject subdomain attack attempt', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest();

      const { mockRes } = sendRedirect({
        referer: 'https://evil.test.forgeblocks.com.attacker.com/am/oauth2/authorize'
      });

      await expect(tokenPromise).rejects.toThrow('Origin validation failed: hostname mismatch');
      expect(mockServerInstance.close).toHaveBeenCalled();
      expect(mockRes.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'text/html; charset=utf-8' });
    });

    it('should reject request with invalid URL format', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest();

      const { mockRes } = sendRedirect({ referer: 'not-a-valid-url' });

      await expect(tokenPromise).rejects.toThrow('Origin validation failed: invalid URL format');
      expect(mockServerInstance.close).toHaveBeenCalled();
      expect(mockRes.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'text/html; charset=utf-8' });
    });

    it('should prefer referer over origin when both present', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      sendRedirect({
        referer: 'https://test.forgeblocks.com/am/oauth2/authorize',
        origin: 'https://evil.attacker.com'
      });

      await expect(tokenPromise).resolves.toBeDefined();
      expect(mockServerInstance.close).toHaveBeenCalled();
    });
  });

  describe('HTML Response Content', () => {
    it('should return success page on successful authentication', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest({ setupTokenEndpoint: true });

      const { mockRes } = sendRedirect({ referer: 'https://test.forgeblocks.com/am/oauth2/authorize' });

      await tokenPromise;

      const htmlContent = mockRes.end.mock.calls[0][0];
      expect(htmlContent).toContain('Authorization Successful');
      expect(htmlContent).toContain('window.close()');
    });

    it('should return error page on CSRF failure', async () => {
      const { tokenPromise } = await setupPkceFlowTest();

      const mockReq = {
        url: `http://localhost:3000?code=test-code&state=invalid-state`,
        headers: { referer: 'https://test.forgeblocks.com/am/oauth2/authorize' }
      };
      const mockRes = { end: vi.fn(), writeHead: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await expect(tokenPromise).rejects.toThrow('CSRF protection failed');

      const htmlContent = mockRes.end.mock.calls[0][0];
      expect(htmlContent).toContain('Authorization Failed');
      expect(htmlContent).toContain('Invalid state parameter');
    });

    it('should return error page on origin validation failure', async () => {
      const { tokenPromise, sendRedirect } = await setupPkceFlowTest();

      const { mockRes } = sendRedirect({ referer: 'https://evil.attacker.com/am/oauth2/authorize' });

      await expect(tokenPromise).rejects.toThrow('Origin validation failed');

      const htmlContent = mockRes.end.mock.calls[0][0];
      expect(htmlContent).toContain('Authorization Failed');
      expect(htmlContent).toContain('Invalid request origin');
    });

    it('should return error page when auth code missing', async () => {
      const { tokenPromise, state } = await setupPkceFlowTest();

      const mockReq = {
        url: `http://localhost:3000?state=${state}`,
        headers: { referer: 'https://test.forgeblocks.com/am/oauth2/authorize' }
      };
      const mockRes = { end: vi.fn(), writeHead: vi.fn() };
      mockRequestHandler(mockReq, mockRes);

      await expect(tokenPromise).rejects.toThrow('Authorization code not found');

      const htmlContent = mockRes.end.mock.calls[0][0];
      expect(htmlContent).toContain('Authorization Failed');
      expect(htmlContent).toContain('No authorization code received');
    });
  });
});
