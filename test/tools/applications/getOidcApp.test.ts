import { describe, it, expect } from 'vitest';
import { getOidcAppTool } from '../../../src/tools/applications/getOidcApp.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getOidcApp', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getOidcApp', getOidcAppTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should query IDM by application name', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      await getOidcAppTool.toolFunction({ realm: 'alpha', name: 'My App' });

      const idmCall = getSpy().mock.calls.find(([url]) => url.includes('openidm/managed'));
      expect(idmCall).toBeDefined();
      expect(idmCall![0]).toContain('name%20eq%20%22My%20App%22');
    });

    it('should fetch AM OAuth2Client using clientId from IDM result', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-1', name: 'My App', ssoEntities: { oidcId: 'my-client' } }]
          });
        }),
        http.get('https://*/am/json/alpha/realm-config/agents/OAuth2Client/my-client', () => {
          return HttpResponse.json({ _id: 'my-client', coreOAuth2ClientConfig: {} });
        })
      );

      await getOidcAppTool.toolFunction({ realm: 'alpha', name: 'My App' });

      const amCall = getSpy().mock.calls.find(([url]) => url.includes('OAuth2Client/my-client'));
      expect(amCall).toBeDefined();
      expect(amCall![2]?.method).toBe('GET');
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

      const result = await getOidcAppTool.toolFunction({ realm: 'alpha', name: 'Nonexistent' });
      expect(result.content[0].text).toContain('No application found');
    });

    it('should return IDM data even when AM client is missing', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({
            result: [{ _id: 'app-1', name: 'My App', ssoEntities: { oidcId: 'dead-client' } }]
          });
        }),
        http.get('https://*/am/json/alpha/realm-config/agents/OAuth2Client/dead-client', () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found' }), { status: 404 });
        })
      );

      const result = await getOidcAppTool.toolFunction({ realm: 'alpha', name: 'My App' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.oauth2Client).toBeNull();
      expect(parsed.managedApplication._id).toBe('app-1');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty name', () => {
      const schema = getOidcAppTool.inputSchema.name;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept valid realm values', () => {
      const schema = getOidcAppTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle IDM query errors', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await getOidcAppTool.toolFunction({ realm: 'alpha', name: 'My App' });
      expect(result.content[0].text).toContain('Failed to get OIDC app');
    });
  });
});
