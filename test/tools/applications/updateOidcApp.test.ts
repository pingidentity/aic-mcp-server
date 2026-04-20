import { describe, it, expect } from 'vitest';
import { updateOidcAppTool } from '../../../src/tools/applications/updateOidcApp.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

const mockCurrentAmConfig = {
  _id: 'my-client',
  _rev: 'rev-from-get',
  _type: { _id: 'OAuth2Client', name: 'OAuth2.0 Client', collection: true },
  coreOAuth2ClientConfig: {
    redirectionUris: { inherited: false, value: ['https://old.example.com/callback'] },
    status: { inherited: false, value: 'Active' },
    clientName: { inherited: false, value: ['My App'] }
  },
  advancedOAuth2ClientConfig: {
    grantTypes: { inherited: false, value: ['authorization_code'] },
    tokenEndpointAuthMethod: { inherited: false, value: 'client_secret_basic' }
  },
  overrideOAuth2ClientConfig: {
    providerOverridesEnabled: false,
    statelessTokensEnabled: false,
    issueRefreshToken: true
  }
};

function useIdmLookupHandler(clientId = 'my-client') {
  server.use(
    http.get('https://*/openidm/managed/alpha_application', () => {
      return HttpResponse.json({
        result: [{ _id: 'app-1', ssoEntities: { oidcId: clientId } }]
      });
    })
  );
}

function useAmHandlers(currentConfig = mockCurrentAmConfig) {
  server.use(
    http.get('https://*/am/json/alpha/realm-config/agents/OAuth2Client/*', () => {
      return HttpResponse.json(currentConfig);
    }),
    http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/*', async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json({ _id: 'my-client', ...(body as object) });
    })
  );
}

describe('updateOidcApp', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateOidcApp', updateOidcAppTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should look up application by name first', async () => {
      useIdmLookupHandler();
      useAmHandlers();

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: { coreOAuth2ClientConfig: {} }
      });

      const lookupCall = getSpy().mock.calls[0];
      expect(lookupCall[0]).toContain('name%20eq%20%22My%20App%22');
    });

    it('should GET current AM config before PUT', async () => {
      useIdmLookupHandler();
      useAmHandlers();

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: { coreOAuth2ClientConfig: {} }
      });

      const amCalls = getSpy().mock.calls.filter(([url]) => url.includes('OAuth2Client/my-client'));
      expect(amCalls).toHaveLength(2);
      expect(amCalls[0][2]?.method).toBe('GET');
      expect(amCalls[1][2]?.method).toBe('PUT');
    });

    it('should use _rev from GET response as If-Match on PUT', async () => {
      useIdmLookupHandler();
      useAmHandlers();

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: { coreOAuth2ClientConfig: {} }
      });

      const putCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('OAuth2Client/my-client') && opts?.method === 'PUT'
      );
      expect((putCall![2]?.headers as any)['If-Match']).toBe('rev-from-get');
    });

    it('should PATCH IDM managed application with If-Match header', async () => {
      useIdmLookupHandler();

      server.use(
        http.patch('https://*/openidm/managed/alpha_application/app-1', () => {
          return HttpResponse.json({ _id: 'app-1', _rev: '2' });
        })
      );

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        managedApplication: {
          _rev: 'rev-1',
          operations: [{ operation: 'replace', field: '/description', value: 'Updated' }]
        }
      });

      const patchCall = getSpy().mock.calls.find(([url]) => url.includes('alpha_application/app-1'));
      expect(patchCall).toBeDefined();
      expect(patchCall![2]?.method).toBe('PATCH');
      expect((patchCall![2]?.headers as any)['If-Match']).toBe('rev-1');
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should deep merge partial oauth2Client updates into current config', async () => {
      useIdmLookupHandler();
      useAmHandlers();

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: {
          coreOAuth2ClientConfig: {
            redirectionUris: { inherited: false, value: ['https://new.example.com/callback'] }
          }
        }
      });

      const putCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT'
      );
      const putBody = JSON.parse(putCall![2]?.body as string);

      // Updated property
      expect(putBody.coreOAuth2ClientConfig.redirectionUris.value).toEqual(['https://new.example.com/callback']);
      // Preserved properties in same section
      expect(putBody.coreOAuth2ClientConfig.status.value).toBe('Active');
      expect(putBody.coreOAuth2ClientConfig.clientName.value).toEqual(['My App']);
    });

    it('should preserve sections not included in the update', async () => {
      useIdmLookupHandler();
      useAmHandlers();

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: {
          coreOAuth2ClientConfig: {
            redirectionUris: { inherited: false, value: ['https://new.example.com'] }
          }
        }
      });

      const putCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT'
      );
      const putBody = JSON.parse(putCall![2]?.body as string);

      expect(putBody.advancedOAuth2ClientConfig.grantTypes.value).toEqual(['authorization_code']);
      expect(putBody.advancedOAuth2ClientConfig.tokenEndpointAuthMethod.value).toBe('client_secret_basic');
    });

    it('should replace individual properties within a section completely', async () => {
      useIdmLookupHandler();
      useAmHandlers();

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: {
          advancedOAuth2ClientConfig: {
            grantTypes: { inherited: false, value: ['implicit', 'authorization_code'] }
          }
        }
      });

      const putCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT'
      );
      const putBody = JSON.parse(putCall![2]?.body as string);

      expect(putBody.advancedOAuth2ClientConfig.grantTypes).toEqual({
        inherited: false,
        value: ['implicit', 'authorization_code']
      });
      // Other property in same section preserved
      expect(putBody.advancedOAuth2ClientConfig.tokenEndpointAuthMethod.value).toBe('client_secret_basic');
    });

    it('should strip _id, _rev, and _type metadata from GET before merging', async () => {
      useIdmLookupHandler();
      useAmHandlers();

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: {
          coreOAuth2ClientConfig: {
            status: { inherited: false, value: 'Inactive' }
          }
        }
      });

      const putCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT'
      );
      const putBody = JSON.parse(putCall![2]?.body as string);

      expect(putBody._id).toBeUndefined();
      expect(putBody._rev).toBeUndefined();
      expect(putBody._type).toBeUndefined();
    });

    it('should handle flat-value sections like overrideOAuth2ClientConfig', async () => {
      useIdmLookupHandler();
      useAmHandlers();

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: {
          overrideOAuth2ClientConfig: {
            providerOverridesEnabled: true
          }
        }
      });

      const putCall = getSpy().mock.calls.find(
        ([url, , opts]) => url.includes('OAuth2Client') && opts?.method === 'PUT'
      );
      const putBody = JSON.parse(putCall![2]?.body as string);

      expect(putBody.overrideOAuth2ClientConfig.providerOverridesEnabled).toBe(true);
      expect(putBody.overrideOAuth2ClientConfig.statelessTokensEnabled).toBe(false);
      expect(putBody.overrideOAuth2ClientConfig.issueRefreshToken).toBe(true);
    });

    it('should strip ssoEntities from patch operations', async () => {
      useIdmLookupHandler();

      server.use(
        http.patch('https://*/openidm/managed/alpha_application/app-1', () => {
          return HttpResponse.json({ _id: 'app-1', _rev: '2' });
        })
      );

      await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        managedApplication: {
          _rev: 'rev-1',
          operations: [
            { operation: 'replace', field: '/ssoEntities/oidcId', value: 'hacked' },
            { operation: 'replace', field: '/description', value: 'Safe' }
          ]
        }
      });

      const patchCall = getSpy().mock.calls.find(([, , opts]) => opts?.method === 'PATCH');
      const body = JSON.parse(patchCall![2]?.body as string);
      expect(body).toHaveLength(1);
      expect(body[0].field).toBe('/description');
    });

    it('should return error when no application found', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      const result = await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'Nonexistent',
        oauth2Client: {}
      });

      expect(result.content[0].text).toContain('No application found');
    });

    it('should return error when nothing to update', async () => {
      const result = await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App'
      });

      expect(result.content[0].text).toContain('Nothing to update');
    });

    it('should return error when no linked clientId for AM update', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-1', ssoEntities: {} }]
          });
        })
      );

      const result = await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: { coreOAuth2ClientConfig: {} }
      });

      expect(result.content[0].text).toContain('no linked client ID');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty name', () => {
      const schema = updateOidcAppTool.inputSchema.name;
      expect(() => schema.parse('')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle AM GET errors before merge', async () => {
      useIdmLookupHandler();

      server.use(
        http.get('https://*/am/json/alpha/realm-config/agents/OAuth2Client/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found' }), { status: 404 });
        })
      );

      const result = await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: { coreOAuth2ClientConfig: {} }
      });

      expect(result.content[0].text).toContain('Failed to update OIDC app');
    });

    it('should handle AM PUT errors', async () => {
      useIdmLookupHandler();

      server.use(
        http.get('https://*/am/json/alpha/realm-config/agents/OAuth2Client/*', () => {
          return HttpResponse.json(mockCurrentAmConfig);
        }),
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad_request' }), { status: 400 });
        })
      );

      const result = await updateOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        oauth2Client: { bad: 'config' }
      });

      expect(result.content[0].text).toContain('Failed to update OIDC app');
    });
  });
});
