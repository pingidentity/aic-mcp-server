import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import {
  createMockMcpServer,
  setupAuthServiceTest,
  MOCK_DEVICE_CODE_RESPONSE,
  MOCK_TOKEN_RESPONSE
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
  KeychainStorage: MockStorage
}));

// Mock 'open' to prevent browser launching during tests
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined)
}));

/**
 * Tests for AuthService OAuth 2.0 Device Code Flow (RFC 8628)
 *
 * Tests the device code flow implementation in executeDeviceFlow(), including:
 * - Device code request with PKCE
 * - MCP form elicitation
 * - User cancellation handling
 * - Token polling logic
 * - Token storage after successful authentication
 * - Completion notification
 */
describe('AuthService Device Code Flow', () => {
  setupAuthServiceTest();

  let mockMcpServer: ReturnType<typeof createMockMcpServer>;

  beforeEach(async () => {
    // Set container mode
    process.env.DOCKER_CONTAINER = 'true';

    // Reset modules to clear singleton instance
    vi.resetModules();

    // Create fresh mock MCP server
    mockMcpServer = createMockMcpServer();

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

    // Use fake timers for polling intervals
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Device Code Request', () => {
    it('should POST to /am/oauth2/device/code with correct parameters and PKCE challenge', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      let capturedRequest: Request | undefined;
      let codeChallenge: string | null = null;

      // Mock device code endpoint
      server.use(
        http.post('https://*/am/oauth2/device/code', async ({ request }) => {
          capturedRequest = request.clone();
          const body = await request.text();
          const params = new URLSearchParams(body);
          codeChallenge = params.get('code_challenge');
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      // Start the flow (don't await yet - we need to advance timers)
      const tokenPromise = getAuthService().getToken(['fr:idm:*']);

      // Wait for elicitation to complete
      await vi.waitFor(() => {
        expect(mockMcpServer.server.elicitInput).toHaveBeenCalled();
      });

      // Advance timer for polling interval
      await vi.advanceTimersByTimeAsync(5000);

      // Wait for completion
      await tokenPromise;

      // Verify request was made
      expect(capturedRequest).toBeDefined();

      // Parse request body
      const body = await capturedRequest!.text();
      const params = new URLSearchParams(body);

      // Verify parameters
      expect(params.get('client_id')).toBe('AICMCPClient');
      expect(params.get('scope')).toBe('fr:idm:*');
      expect(params.get('code_challenge')).toBeTruthy();
      expect(params.get('code_challenge_method')).toBe('S256');
      // PKCE challenge should be a non-empty base64url string
      expect(codeChallenge).toBeTruthy();
      expect(typeof codeChallenge).toBe('string');
      expect(codeChallenge!.length).toBeGreaterThan(0);
    });

    it('should throw error when device code request fails', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      // Mock device code endpoint to return error
      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return new HttpResponse('Invalid client', { status: 400 });
        })
      );

      await expect(getAuthService().getToken(['fr:idm:*'])).rejects.toThrow(
        'Device code request failed (400 Bad Request): Invalid client'
      );
    });
  });

  describe('MCP Form Elicitation', () => {
    it('should call mcpServer.server.elicitInput() with expected payload', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);
      await tokenPromise;

      expect(mockMcpServer.server.elicitInput).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'form',
          message: expect.stringContaining(MOCK_DEVICE_CODE_RESPONSE.verification_uri_complete),
          requestedSchema: {
            type: 'object',
            properties: {},
            required: []
          },
          elicitationId: expect.stringMatching(/^[0-9a-f-]{36}$/i) // UUID format
        })
      );
    });

    it('should throw error when mcpServer is not provided', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      // Initialize without mcpServer
      initAuthService(['fr:idm:*'], {});

      await expect(getAuthService().getToken(['fr:idm:*'])).rejects.toThrow(
        'MCP server reference required for device code flow. Pass mcpServer in AuthServiceConfig.'
      );
    });
  });

  describe('User Cancellation', () => {
    it('should throw error when user cancels (action !== "accept")', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');

      // Mock elicitInput to return cancel action
      const cancelMcpServer = createMockMcpServer();
      cancelMcpServer.server.elicitInput.mockResolvedValue({ action: 'cancel' });

      initAuthService(['fr:idm:*'], { mcpServer: cancelMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        })
      );

      await expect(getAuthService().getToken(['fr:idm:*'])).rejects.toThrow(
        'User cancelled authentication (action: cancel)'
      );
    });

    it('should not start polling when user cancels', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');

      const cancelMcpServer = createMockMcpServer();
      cancelMcpServer.server.elicitInput.mockResolvedValue({ action: 'cancel' });

      initAuthService(['fr:idm:*'], { mcpServer: cancelMcpServer });

      let pollingAttempted = false;
      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          pollingAttempted = true;
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      try {
        await getAuthService().getToken(['fr:idm:*']);
      } catch {
        // Expected to throw
      }

      // Token endpoint should NOT have been called
      expect(pollingAttempted).toBe(false);
    });
  });

  describe('Token Polling', () => {
    it('should wait for interval before first poll and include device_code/client_id/code_verifier', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      let pollAttempted = false;
      let capturedParams: URLSearchParams | undefined;

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const bodyText = await request.text();
          const params = new URLSearchParams(bodyText);

          if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
            pollAttempted = true;
            capturedParams = params;
            return HttpResponse.json(MOCK_TOKEN_RESPONSE);
          }

          return HttpResponse.json({
            access_token: 'mock-scoped-token',
            expires_in: 3600,
            token_type: 'Bearer'
          });
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());

      expect(pollAttempted).toBe(false);

      await vi.advanceTimersByTimeAsync(5000);
      await tokenPromise;

      expect(pollAttempted).toBe(true);
      expect(capturedParams).toBeDefined();
      expect(capturedParams!.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
      expect(capturedParams!.get('device_code')).toBe(MOCK_DEVICE_CODE_RESPONSE.device_code);
      expect(capturedParams!.get('client_id')).toBe('AICMCPClient');
      expect(capturedParams!.get('code_verifier')).toBeTruthy();
    });

    it.each([
      {
        name: 'continues on authorization_pending and eventually succeeds',
        polls: [{ error: 'authorization_pending', status: 400 }, { tokenResponse: MOCK_TOKEN_RESPONSE }],
        expectedError: null
      },
      {
        name: 'throws on access_denied',
        polls: [{ error: 'access_denied', error_description: 'User denied authorization', status: 400 }],
        expectedError: 'Device code polling failed: access_denied'
      },
      {
        name: 'throws on invalid_grant',
        polls: [{ error: 'invalid_grant', error_description: 'Device code is invalid', status: 400 }],
        expectedError: 'Device code polling failed: invalid_grant'
      },
      {
        name: 'throws on timeout/expired code',
        polls: [{ error: 'authorization_pending', status: 400, repeat: true }],
        shortExpiry: { expires_in: 10, interval: 2 },
        expectedError: 'Device code expired - authentication timed out'
      }
    ])('$name', async ({ polls, expectedError, shortExpiry }) => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      const deviceResponse = shortExpiry ? { ...MOCK_DEVICE_CODE_RESPONSE, ...shortExpiry } : MOCK_DEVICE_CODE_RESPONSE;

      let pollIndex = 0;
      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(deviceResponse);
        }),
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
            const current = polls[Math.min(pollIndex, polls.length - 1)];
            pollIndex += 1;

            if (current.tokenResponse) {
              return HttpResponse.json(current.tokenResponse);
            }

            return HttpResponse.json(
              { error: current.error, error_description: current.error_description },
              { status: current.status }
            );
          }

          return HttpResponse.json({
            access_token: 'mock-scoped-token',
            expires_in: 3600,
            token_type: 'Bearer'
          });
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());

      if (expectedError) {
        const expiryMs = (shortExpiry?.expires_in ?? deviceResponse.expires_in) * 1000 + 1000;
        await Promise.all([vi.advanceTimersByTimeAsync(expiryMs), expect(tokenPromise).rejects.toThrow(expectedError)]);
      } else {
        await vi.advanceTimersByTimeAsync(deviceResponse.interval * 1000);
        await vi.advanceTimersByTimeAsync(deviceResponse.interval * 1000);
        await tokenPromise;
      }
    });
  });

  describe('PKCE Integration', () => {
    it('should use same verifier in token poll that was generated during device code request', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      let codeChallenge: string | null = null;
      let codeVerifier: string | null = null;

      server.use(
        http.post('https://*/am/oauth2/device/code', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);
          codeChallenge = params.get('code_challenge');
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
            codeVerifier = params.get('code_verifier');
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);
      await tokenPromise;

      // Both should be present
      expect(codeChallenge).toBeTruthy();
      expect(codeVerifier).toBeTruthy();

      // Verifier should be a base64url string
      expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should clear verifier after flow completes successfully', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);
      await tokenPromise;

      // Access the internal state (testing implementation detail for security)
      const authService = getAuthService() as any;
      expect(authService.deviceCodeVerifier).toBeUndefined();
    });

    it('should clear verifier after flow fails', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
            return HttpResponse.json({ error: 'access_denied' }, { status: 400 });
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());

      // Advance timers and verify rejection simultaneously to prevent unhandled rejection
      await Promise.all([vi.advanceTimersByTimeAsync(5000), expect(tokenPromise).rejects.toThrow()]);

      // Verifier should be cleared even on error
      const authService = getAuthService() as any;
      expect(authService.deviceCodeVerifier).toBeUndefined();
    });
  });

  describe('Token Storage', () => {
    it('should call storage.setToken() and store accessToken/expiry/baseUrl', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      const mockNow = 1000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);
      await tokenPromise;

      const storage = getStorage();
      expect(storage._mockSetToken()).toHaveBeenCalledTimes(1);
      expect(storage._mockSetToken()).toHaveBeenCalledWith({
        accessToken: MOCK_TOKEN_RESPONSE.access_token,
        expiresAt: mockNow + MOCK_TOKEN_RESPONSE.expires_in * 1000,
        aicBaseUrl: 'test.forgeblocks.com'
      });
    });

    it('should set hasAuthenticatedThisSession to true', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);
      await tokenPromise;

      // Access internal state
      const authService = getAuthService() as any;
      expect(authService.hasAuthenticatedThisSession).toBe(true);
    });
  });

  describe('Completion Notification', () => {
    it('should send notifications/elicitation/complete after success', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);
      await tokenPromise;

      expect(mockMcpServer.server.notification).toHaveBeenCalledWith({
        method: 'notifications/elicitation/complete',
        params: { elicitationId: expect.stringMatching(/^[0-9a-f-]{36}$/i) }
      });
    });

    it('should include same elicitationId from elicitInput call', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);
      await tokenPromise;

      const elicitCall = mockMcpServer.server.elicitInput.mock.calls[0][0];
      const notificationCall = mockMcpServer.server.notification.mock.calls[0][0];

      expect(notificationCall.params.elicitationId).toBe(elicitCall.elicitationId);
    });

    it('should not fail flow if notification fails', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');

      const failingMcpServer = createMockMcpServer();
      failingMcpServer.server.notification.mockRejectedValue(new Error('Notification not supported'));

      initAuthService(['fr:idm:*'], { mcpServer: failingMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const bodyText = await request.text();
          const params = new URLSearchParams(bodyText);

          // Device code grant
          if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
            return HttpResponse.json(MOCK_TOKEN_RESPONSE);
          }

          // Token exchange
          return HttpResponse.json({
            access_token: 'mock-scoped-token',
            expires_in: 3600,
            token_type: 'Bearer'
          });
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(failingMcpServer.server.elicitInput).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5000);

      // Should complete successfully despite notification failure
      const token = await tokenPromise;
      expect(token).toBe('mock-scoped-token');
    });
  });

  describe('Error Handling', () => {
    it('should propagate device code request errors', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return new HttpResponse('Server error', { status: 500 });
        })
      );

      await expect(getAuthService().getToken(['fr:idm:*'])).rejects.toThrow(
        'Device code request failed (500 Internal Server Error): Server error'
      );
    });

    it('should propagate polling errors', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', async ({ request }) => {
          const body = await request.text();
          const params = new URLSearchParams(body);

          if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code') {
            return HttpResponse.json(
              { error: 'invalid_grant', error_description: 'Device code is invalid' },
              { status: 400 }
            );
          }

          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());

      // Advance timers and verify rejection simultaneously to prevent unhandled rejection
      await Promise.all([
        vi.advanceTimersByTimeAsync(5000),
        expect(tokenPromise).rejects.toThrow('Device code polling failed: invalid_grant')
      ]);
    });

    it('should propagate storage errors', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      // Mock storage to throw error on setToken
      getStorage()._mockSetToken().mockRejectedValue(new Error('Disk full'));

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return HttpResponse.json(MOCK_DEVICE_CODE_RESPONSE);
        }),
        http.post('https://*/am/oauth2/access_token', () => {
          return HttpResponse.json(MOCK_TOKEN_RESPONSE);
        })
      );

      const tokenPromise = getAuthService().getToken(['fr:idm:*']);
      await vi.waitFor(() => expect(mockMcpServer.server.elicitInput).toHaveBeenCalled());

      // Advance timers and verify rejection simultaneously to prevent unhandled rejection
      await Promise.all([vi.advanceTimersByTimeAsync(5000), expect(tokenPromise).rejects.toThrow('Disk full')]);
    });

    it('should log errors to console', async () => {
      const { initAuthService, getAuthService } = await import('../../../src/services/authService.js');
      initAuthService(['fr:idm:*'], { mcpServer: mockMcpServer });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      server.use(
        http.post('https://*/am/oauth2/device/code', () => {
          return new HttpResponse('Error', { status: 500 });
        })
      );

      await expect(getAuthService().getToken(['fr:idm:*'])).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Device code authentication failed:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });
});
