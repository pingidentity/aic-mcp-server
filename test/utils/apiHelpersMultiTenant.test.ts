import { describe, it, expect, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';

const authServices = new Map<
  string,
  { getToken: ReturnType<typeof vi.fn>; forceReauthentication: ReturnType<typeof vi.fn> }
>();

vi.mock('../../src/services/authService.js', () => ({
  getAuthService: (name: string) => authServices.get(name)
}));

function mockAuthService(name: string, tokens: string[]) {
  const getToken = vi.fn();
  tokens.forEach((token) => getToken.mockResolvedValueOnce(token));
  const service = { getToken, forceReauthentication: vi.fn().mockResolvedValue(undefined) };
  authServices.set(name, service);
  return service;
}

async function loadModules() {
  vi.resetModules();
  vi.stubEnv('AIC_TENANTS', JSON.stringify({ dev: 'dev.example.com', prod: 'prod.example.com' }));
  vi.stubEnv('AIC_ORDER_OF_TENANTS', 'dev,prod');
  const { makeAuthenticatedRequest } = await import('../../src/utils/apiHelpers.js');
  const { runWithEnvironment } = await import('../../src/services/environmentContext.js');
  return { makeAuthenticatedRequest, runWithEnvironment };
}

describe('makeAuthenticatedRequest with multiple tenants', () => {
  afterEach(() => {
    authServices.clear();
    vi.unstubAllEnvs();
  });

  it('sends the request to the selected environment with that environment token', async () => {
    mockAuthService('dev', ['dev-token']);
    mockAuthService('prod', ['prod-token']);
    let received: { host: string; authorization: string | null } | undefined;
    server.use(
      http.get('https://prod.example.com/openidm/managed/alpha_user', ({ request }) => {
        received = { host: new URL(request.url).host, authorization: request.headers.get('Authorization') };
        return HttpResponse.json({ result: [] });
      })
    );
    const { makeAuthenticatedRequest, runWithEnvironment } = await loadModules();

    // URLs built from the legacy AIC_BASE_URL are rewritten to the selected tenant.
    await runWithEnvironment('prod', () =>
      makeAuthenticatedRequest('https://dev.example.com/openidm/managed/alpha_user', ['fr:idm:*'])
    );

    expect(received).toEqual({ host: 'prod.example.com', authorization: 'Bearer prod-token' });
    expect(authServices.get('dev')!.getToken).not.toHaveBeenCalled();
  });

  it('re-authenticates once and retries when the tenant returns 401', async () => {
    const prod = mockAuthService('prod', ['expired-token', 'fresh-token']);
    mockAuthService('dev', []);
    const authorizations: (string | null)[] = [];
    server.use(
      http.get('https://prod.example.com/openidm/info', ({ request }) => {
        const authorization = request.headers.get('Authorization');
        authorizations.push(authorization);
        return authorization === 'Bearer fresh-token'
          ? HttpResponse.json({ ok: true })
          : new HttpResponse('Unauthorized', { status: 401 });
      })
    );
    const { makeAuthenticatedRequest, runWithEnvironment } = await loadModules();

    const { data } = await runWithEnvironment('prod', () =>
      makeAuthenticatedRequest('https://prod.example.com/openidm/info', ['fr:idm:*'])
    );

    expect(data).toEqual({ ok: true });
    expect(prod.forceReauthentication).toHaveBeenCalledTimes(1);
    expect(authorizations).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
  });

  it('does not retry more than once when the tenant keeps returning 401', async () => {
    const prod = mockAuthService('prod', ['token-1', 'token-2']);
    mockAuthService('dev', []);
    let calls = 0;
    server.use(
      http.get('https://prod.example.com/openidm/info', () => {
        calls++;
        return new HttpResponse('Unauthorized', { status: 401 });
      })
    );
    const { makeAuthenticatedRequest, runWithEnvironment } = await loadModules();

    await expect(
      runWithEnvironment('prod', () => makeAuthenticatedRequest('https://prod.example.com/openidm/info', ['fr:idm:*']))
    ).rejects.toThrow();

    expect(calls).toBe(2);
    expect(prod.forceReauthentication).toHaveBeenCalledTimes(1);
  });
});
