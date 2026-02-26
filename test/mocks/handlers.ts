import { http, HttpResponse } from 'msw';
import { mockManagedObjects, mockManagedObjectConfig, mockThemes, mockVariables, mockLogSources } from './mockData.js';

/**
 * Helper to validate Authorization header is present and valid
 * Returns error response if invalid, null if valid
 *
 * Reusable in test-specific MSW handlers via server.use()
 */
export function validateAuthHeader(request: Request): HttpResponse<string> | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new HttpResponse(
      JSON.stringify({ error: 'unauthorized', message: 'Missing Authorization header' }),
      { status: 401 }
    );
  }

  if (!authHeader.startsWith('Bearer ')) {
    return new HttpResponse(
      JSON.stringify({ error: 'unauthorized', message: 'Invalid Authorization header format' }),
      { status: 401 }
    );
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  if (!token || token !== 'mock-scoped-token') {
    return new HttpResponse(
      JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired token' }),
      { status: 401 }
    );
  }

  return null; // Valid auth
}

export const handlers = [
  // OAuth - PKCE authorization code exchange
  http.post('https://*/am/oauth2/access_token', async ({ request }) => {
    const body = await request.text();
    const params = new URLSearchParams(body);

    if (params.get('grant_type') === 'authorization_code') {
      return HttpResponse.json({
        access_token: 'mock-primary-token',
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }

    // RFC 8693 token exchange
    if (params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:token-exchange') {
      const subjectToken = params.get('subject_token');
      const requestedScopes = params.get('scope');
      const clientId = params.get('client_id');

      // Validate parameters
      if (!subjectToken || subjectToken !== 'mock-token') {
        return new HttpResponse(
          JSON.stringify({ error: 'invalid_token' }),
          { status: 401 }
        );
      }

      if (clientId !== 'AICMCPExchangeClient') {
        return new HttpResponse(
          JSON.stringify({ error: 'invalid_client' }),
          { status: 400 }
        );
      }

      if (!requestedScopes) {
        return new HttpResponse(
          JSON.stringify({ error: 'invalid_scope' }),
          { status: 400 }
        );
      }

      return HttpResponse.json({
        access_token: 'mock-scoped-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: requestedScopes, // Echo back the requested scopes
      });
    }

    return new HttpResponse(null, { status: 400 });
  }),

  // Query managed objects (generic for all object types)
  http.get('https://*/openidm/managed/:objectType', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const pageSize = parseInt(url.searchParams.get('_pageSize') || '50');

    return HttpResponse.json({
      result: mockManagedObjects.slice(0, pageSize),
      resultCount: mockManagedObjects.length,
      totalPagedResults: mockManagedObjects.length,
      pagedResultsCookie: null,
    });
  }),

  // Get managed object schema
  http.get('https://*/openidm/config/managed', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json(mockManagedObjectConfig);
  }),

  // Create managed object
  http.post('https://*/openidm/managed/:objectType', async ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = await request.json() as Record<string, any>;
    return HttpResponse.json({ _id: 'new-id', _rev: '1', ...body });
  }),

  // Get single managed object
  http.get('https://*/openidm/managed/:objectType/:objectId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ ...mockManagedObjects[0], _id: params.objectId });
  }),

  // Patch managed object
  http.patch('https://*/openidm/managed/:objectType/:objectId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.objectId, _rev: '2' });
  }),

  // Delete managed object
  http.delete('https://*/openidm/managed/:objectType/:objectId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.objectId });
  }),

  // Themes - getThemes endpoint (query all themes)
  http.get('https://*/openidm/ui/theme/', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: mockThemes,
      resultCount: mockThemes.length,
    });
  }),

  // Themes - config endpoint (used by other theme operations)
  http.get('https://*/openidm/config/ui/theming', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ themes: mockThemes });
  }),

  http.get('https://*/openidm/config/ui/theming/:themeId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ ...mockThemes[0], _id: params.themeId });
  }),

  http.put('https://*/openidm/config/ui/theming', async ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = await request.json() as Record<string, any>;
    return HttpResponse.json({ _id: 'theme-new', ...body });
  }),

  http.patch('https://*/openidm/config/ui/theming/:themeId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ ...mockThemes[0], _id: params.themeId });
  }),

  http.delete('https://*/openidm/config/ui/theming/:themeId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.themeId });
  }),

  // ESVs
  http.get('https://*/environment/variables', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: mockVariables,
      resultCount: mockVariables.length,
      totalPagedResults: mockVariables.length,
    });
  }),

  http.get('https://*/environment/variables/:variableId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ ...mockVariables[0], _id: params.variableId });
  }),

  http.put('https://*/environment/variables/:variableId', async ({ request, params }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const body = await request.json() as Record<string, any>;
    return HttpResponse.json({ _id: params.variableId, ...body });
  }),

  http.delete('https://*/environment/variables/:variableId', ({ params, request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: params.variableId });
  }),

  // Logs
  http.get('https://*/monitoring/logs/sources', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json(mockLogSources);
  }),

  http.post('https://*/monitoring/logs', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: [],
      resultCount: 0,
      totalPagedResults: 0,
    });
  }),

  // AM - Journey list
  http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      result: [],
      resultCount: 0,
    });
  }),

  // AM - Single journey
  http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: 'Login',
      nodes: {},
    });
  }),

  // AM - Node schema (POST with _action=schema)
  http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      type: 'object',
      properties: {},
    });
  }),

  // AM - Node config (GET)
  http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: 'node-123',
      nodeType: 'TestNode',
    });
  }),

  // AM - Scripts
  http.get('https://*/am/json/*/scripts/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      _id: 'script-123',
      name: 'TestScript',
      script: '',
      language: 'JAVASCRIPT',
    });
  }),

  // AM - Create script
  http.post('https://*/am/json/*/scripts', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    const url = new URL(request.url);
    if (url.searchParams.get('_action') === 'create') {
      return HttpResponse.json({ _id: 'new-script-id', name: 'NewScript' });
    }
    return HttpResponse.json({ error: 'Invalid action' }, { status: 400 });
  }),

  // AM - Update script
  http.put('https://*/am/json/*/scripts/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: 'script-123', name: 'UpdatedScript' });
  }),

  // AM - Delete script
  http.delete('https://*/am/json/*/scripts/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, { status: 204 });
  }),

  // AM - Script contexts
  http.get('https://*/am/json/*/contexts/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({
      bindings: [{ name: 'outcome', type: 'java.lang.String' }],
      allowedImports: ['java.lang.Math']
    });
  }),

  // AM - Save journey (PUT)
  http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: 'TestJourney' });
  }),

  // AM - Delete journey
  http.delete('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, { status: 204 });
  }),

  // AM - Update node (PUT)
  http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ _id: 'node-123' });
  }),

  // AM - Delete node
  http.delete('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return new HttpResponse(null, { status: 204 });
  }),

  // AM - Auth config (GET)
  http.get('https://*/am/json/*/realm-config/authentication', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ core: { orgConfig: 'Login', adminAuthModule: 'Login' } });
  }),

  // AM - Auth config (PUT)
  http.put('https://*/am/json/*/realm-config/authentication', ({ request }) => {
    const authError = validateAuthHeader(request);
    if (authError) return authError;

    return HttpResponse.json({ core: { orgConfig: 'NewDefault', adminAuthModule: 'Login' } });
  }),
];
