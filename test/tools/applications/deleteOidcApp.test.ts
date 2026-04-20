import { describe, it, expect } from 'vitest';
import { deleteOidcAppTool } from '../../../src/tools/applications/deleteOidcApp.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteOidcApp', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteOidcApp', deleteOidcAppTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should look up application by name', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-1', ssoEntities: { oidcId: 'my-client' } }]
          });
        }),
        http.delete('https://*/openidm/managed/alpha_application/app-1', () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.delete('https://*/am/json/alpha/realm-config/agents/OAuth2Client/my-client', () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      await deleteOidcAppTool.toolFunction({ realm: 'alpha', name: 'My App' });

      const lookupCall = getSpy().mock.calls[0];
      expect(lookupCall[0]).toContain('name%20eq%20%22My%20App%22');
    });

    it('should delete IDM then AM', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-1', ssoEntities: { oidcId: 'my-client' } }]
          });
        }),
        http.delete('https://*/openidm/managed/alpha_application/app-1', () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.delete('https://*/am/json/alpha/realm-config/agents/OAuth2Client/my-client', () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      await deleteOidcAppTool.toolFunction({ realm: 'alpha', name: 'My App' });

      const calls = getSpy().mock.calls;
      const idmDeleteIdx = calls.findIndex(
        ([url, , opts]) => url.includes('alpha_application/app-1') && opts?.method === 'DELETE'
      );
      const amDeleteIdx = calls.findIndex(
        ([url, , opts]) => url.includes('OAuth2Client/my-client') && opts?.method === 'DELETE'
      );
      expect(idmDeleteIdx).toBeLessThan(amDeleteIdx);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return not found when no IDM result', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      const result = await deleteOidcAppTool.toolFunction({ realm: 'alpha', name: 'Nonexistent' });
      expect(result.content[0].text).toContain('No application found');
    });

    it('should report what was deleted', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-1', ssoEntities: { oidcId: 'my-client' } }]
          });
        }),
        http.delete('https://*/openidm/managed/alpha_application/app-1', () => {
          return new HttpResponse(null, { status: 204 });
        }),
        http.delete('https://*/am/json/alpha/realm-config/agents/OAuth2Client/my-client', () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      const result = await deleteOidcAppTool.toolFunction({ realm: 'alpha', name: 'My App' });
      expect(result.content[0].text).toContain('IDM managed application');
      expect(result.content[0].text).toContain('AM OAuth2Client');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty name', () => {
      const schema = deleteOidcAppTool.inputSchema.name;
      expect(() => schema.parse('')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle IDM delete errors', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-1', ssoEntities: { oidcId: 'my-client' } }]
          });
        }),
        http.delete('https://*/openidm/managed/alpha_application/app-1', () => {
          return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
        })
      );

      const result = await deleteOidcAppTool.toolFunction({ realm: 'alpha', name: 'My App' });
      expect(result.content[0].text).toContain('Failed to delete OIDC app');
    });
  });
});
