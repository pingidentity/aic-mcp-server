import { describe, it, expect } from 'vitest';
import { createOidcAppTool } from '../../../src/tools/applications/createOidcApp.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('createOidcApp', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createOidcApp', createOidcAppTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should PUT to AM OAuth2Client endpoint with If-None-Match header', async () => {
      server.use(
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/:clientId', () => {
          return HttpResponse.json({ _id: 'my-client' });
        }),
        http.post('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ _id: 'app-id', _rev: '1' });
        })
      );

      await createOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        clientId: 'my-client',
        owners: [{ _ref: 'managed/alpha_user/user1' }]
      });

      const amCall = getSpy().mock.calls.find(([url]) => url.includes('OAuth2Client'));
      expect(amCall).toBeDefined();
      expect(amCall![0]).toContain('OAuth2Client/my-client');
      expect(amCall![2]?.method).toBe('PUT');
      expect((amCall![2]?.headers as any)['If-None-Match']).toBe('*');
    });

    it('should POST to IDM managed application endpoint', async () => {
      server.use(
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/:clientId', () => {
          return HttpResponse.json({ _id: 'my-client' });
        }),
        http.post('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ _id: 'app-id', _rev: '1' });
        })
      );

      await createOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        clientId: 'my-client',
        owners: [{ _ref: 'managed/alpha_user/user1' }]
      });

      const idmCall = getSpy().mock.calls.find(([url]) => url.includes('openidm/managed'));
      expect(idmCall).toBeDefined();
      expect(idmCall![2]?.method).toBe('POST');
      const body = JSON.parse(idmCall![2]?.body as string);
      expect(body.name).toBe('My App');
      expect(body.ssoEntities).toEqual({ oidcId: 'my-client' });
      expect(body.templateName).toBe('custom');
      expect(body.templateVersion).toBe('1.0');
    });

    it('should pass correct scopes', async () => {
      server.use(
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/:clientId', () => {
          return HttpResponse.json({ _id: 'my-client' });
        }),
        http.post('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ _id: 'app-id', _rev: '1' });
        })
      );

      await createOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        clientId: 'my-client',
        owners: [{ _ref: 'managed/alpha_user/user1' }]
      });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:am:*', 'fr:idm:*']);
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should sync name to coreOAuth2ClientConfig.clientName when not set', async () => {
      server.use(
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/:clientId', () => {
          return HttpResponse.json({ _id: 'my-client' });
        }),
        http.post('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ _id: 'app-id', _rev: '1' });
        })
      );

      await createOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        clientId: 'my-client',
        owners: [{ _ref: 'managed/alpha_user/user1' }]
      });

      const amCall = getSpy().mock.calls.find(([url]) => url.includes('OAuth2Client'));
      const amBody = JSON.parse(amCall![2]?.body as string);
      expect(amBody.coreOAuth2ClientConfig.clientName).toEqual({
        inherited: false,
        value: ['My App']
      });
    });

    it('should not override explicitly set clientName', async () => {
      server.use(
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/:clientId', () => {
          return HttpResponse.json({ _id: 'my-client' });
        }),
        http.post('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ _id: 'app-id', _rev: '1' });
        })
      );

      await createOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        clientId: 'my-client',
        owners: [{ _ref: 'managed/alpha_user/user1' }],
        oauth2Client: {
          coreOAuth2ClientConfig: {
            clientName: { inherited: false, value: ['Custom Name'] }
          }
        }
      });

      const amCall = getSpy().mock.calls.find(([url]) => url.includes('OAuth2Client'));
      const amBody = JSON.parse(amCall![2]?.body as string);
      expect(amBody.coreOAuth2ClientConfig.clientName.value).toEqual(['Custom Name']);
    });

    it('should make oauth2Client optional', async () => {
      server.use(
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/:clientId', () => {
          return HttpResponse.json({ _id: 'my-client' });
        }),
        http.post('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ _id: 'app-id', _rev: '1' });
        })
      );

      const result = await createOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        clientId: 'my-client',
        owners: [{ _ref: 'managed/alpha_user/user1' }]
      });

      expect(result.content[0].text).not.toContain('Failed');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty name', () => {
      const schema = createOidcAppTool.inputSchema.name;
      expect(() => schema.parse('')).toThrow();
    });

    it('should reject path traversal in clientId', () => {
      const schema = createOidcAppTool.inputSchema.clientId;
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse('foo/bar')).toThrow();
    });

    it('should accept valid clientId', () => {
      const schema = createOidcAppTool.inputSchema.clientId;
      expect(() => schema.parse('my-app-client')).not.toThrow();
    });

    it('should require at least one owner', () => {
      const schema = createOidcAppTool.inputSchema.owners;
      expect(() => schema.parse([])).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle AM 412 Precondition Failed (duplicate client)', async () => {
      server.use(
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/:clientId', () => {
          return new HttpResponse(JSON.stringify({ error: 'precondition_failed' }), { status: 412 });
        })
      );

      const result = await createOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        clientId: 'existing-client',
        owners: [{ _ref: 'managed/alpha_user/user1' }]
      });

      expect(result.content[0].text).toContain('Failed to create OIDC app');
      expect(result.content[0].text).toMatch(/412/);
    });

    it('should not create IDM app if AM creation fails', async () => {
      server.use(
        http.put('https://*/am/json/alpha/realm-config/agents/OAuth2Client/:clientId', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad_request' }), { status: 400 });
        })
      );

      await createOidcAppTool.toolFunction({
        realm: 'alpha',
        name: 'My App',
        clientId: 'my-client',
        owners: [{ _ref: 'managed/alpha_user/user1' }]
      });

      const idmCall = getSpy().mock.calls.find(([url]) => url.includes('openidm/managed'));
      expect(idmCall).toBeUndefined();
    });
  });
});
