import { describe, it, expect, beforeEach } from 'vitest';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { createThemeTool } from '../../../src/tools/themes/createTheme.js';
import { buildRealmConfig, mockThemeConfigHandlers, capturePutBody } from '../../helpers/themeConfigMocks.js';
import { HttpResponse, http } from 'msw';
import { server } from '../../setup.js';

describe('createTheme', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createTheme', createThemeTool);
  });

  // ===== APPLICATION LOGIC TESTS (Complex Multi-Step Process) =====
  describe('Application Logic (Multi-Step Process)', () => {
    it('should validate theme has name field', async () => {
      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: {}
      });

      // Our code pre-validates themeData before API call
      expect(result.content[0].text).toContain('Theme data must include a "name" property');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should validate theme name is string type', async () => {
      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 123 as any }
      });

      expect(result.content[0].text).toContain('Theme data must include a "name" property');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should fetch current theme config first', async () => {
      mockThemeConfigHandlers(buildRealmConfig({ alpha: [], bravo: [] }));

      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      // Our code GET config before creating
      const calls = getSpy().mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toContain('/openidm/config/ui/themerealm');
      // First call should not have method specified (defaults to GET)
      expect(calls[0][2]).toBeUndefined();
    });

    it.each([
      { name: 'should validate config structure exists', config: { realm: {} as any } },
      { name: 'should validate realm exists in config', config: buildRealmConfig({ bravo: [] }) }
    ])('$name', async ({ config }) => {
      mockThemeConfigHandlers(config as any);

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      expect(result.content[0].text).toContain('Invalid theme configuration structure for realm "alpha"');
    });

    it('should check for duplicate theme name', async () => {
      mockThemeConfigHandlers(
        buildRealmConfig({
          alpha: [{ _id: 'theme-existing', name: 'ExistingTheme', isDefault: false }],
          bravo: []
        })
      );

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'ExistingTheme' }
      });

      expect(result.content[0].text).toContain('Theme with name "ExistingTheme" already exists in realm "alpha"');
      expect(result.content[0].text).toContain('Use a different name or update the existing theme');
    });

    it('should generate UUID for new theme', async () => {
      mockThemeConfigHandlers(buildRealmConfig({ alpha: [], bravo: [] }));

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      const text = result.content[0].text;
      const responseData = JSON.parse(text);
      expect(responseData._id).toBeDefined();
      expect(typeof responseData._id).toBe('string');
      expect(responseData._id.length).toBeGreaterThan(0);
    });

    it('should add _id to themeData', async () => {
      const putCapture = capturePutBody();
      mockThemeConfigHandlers(buildRealmConfig({ alpha: [], bravo: [] }), putCapture.handler);

      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme', primaryColor: '#0066cc' }
      });

      const capturedPutBody = putCapture.get();
      expect(capturedPutBody).not.toBeNull();
      expect(capturedPutBody.realm.alpha).toHaveLength(1);
      expect(capturedPutBody.realm.alpha[0]._id).toBeDefined();
      expect(typeof capturedPutBody.realm.alpha[0]._id).toBe('string');
      expect(capturedPutBody.realm.alpha[0].name).toBe('NewTheme');
      expect(capturedPutBody.realm.alpha[0].primaryColor).toBe('#0066cc');
    });

    it('should set isDefault=false on new theme', async () => {
      const putCapture = capturePutBody();
      mockThemeConfigHandlers(buildRealmConfig({ alpha: [], bravo: [] }), putCapture.handler);

      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      const capturedPutBody = putCapture.get();
      expect(capturedPutBody.realm.alpha[0].isDefault).toBe(false);
    });

    it('should preserve user-provided themeData fields', async () => {
      const putCapture = capturePutBody();
      mockThemeConfigHandlers(buildRealmConfig({ alpha: [], bravo: [] }), putCapture.handler);

      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: {
          name: 'NewTheme',
          primaryColor: '#0066cc',
          logoUrl: 'https://example.com/logo.png',
          customField: 'custom-value'
        }
      });

      const newTheme = putCapture.get().realm.alpha[0];
      expect(newTheme._id).toBeDefined();
      expect(typeof newTheme._id).toBe('string');
      expect(newTheme.isDefault).toBe(false);
      expect(newTheme.name).toBe('NewTheme');
      expect(newTheme.primaryColor).toBe('#0066cc');
      expect(newTheme.logoUrl).toBe('https://example.com/logo.png');
      expect(newTheme.customField).toBe('custom-value');
    });

    it('should append new theme to realm themes array', async () => {
      const putCapture = capturePutBody();
      mockThemeConfigHandlers(
        buildRealmConfig({
          alpha: [
            { _id: 'theme-1', name: 'Theme1', isDefault: false },
            { _id: 'theme-2', name: 'Theme2', isDefault: true }
          ],
          bravo: []
        }),
        putCapture.handler
      );

      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      expect(putCapture.get().realm.alpha).toHaveLength(3);
      expect(putCapture.get().realm.alpha[0].name).toBe('Theme1');
      expect(putCapture.get().realm.alpha[1].name).toBe('Theme2');
      expect(putCapture.get().realm.alpha[2].name).toBe('NewTheme');
    });

    it('should preserve other realm configs', async () => {
      let capturedPutBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [{ _id: 'theme-alpha', name: 'AlphaTheme', isDefault: false }],
              bravo: [{ _id: 'theme-bravo', name: 'BravoTheme', isDefault: true }]
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedPutBody = await request.json();
          return HttpResponse.json(capturedPutBody);
        })
      );

      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewAlphaTheme' }
      });

      // Our code spreads config.realm - preserves bravo realm unchanged
      expect(capturedPutBody.realm.alpha).toHaveLength(2);
      expect(capturedPutBody.realm.bravo).toHaveLength(1);
      expect(capturedPutBody.realm.bravo[0].name).toBe('BravoTheme');
    });

    it('should PUT entire updated config', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          const body = (await request.json()) as any;
          return HttpResponse.json(body);
        })
      );

      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      // Our code sends full config back
      const calls = getSpy().mock.calls;
      // Should have 2 calls: GET then PUT
      expect(calls.length).toBe(2);
      // Second call should be PUT
      expect(calls[1][0]).toContain('/openidm/config/ui/themerealm');
      expect(calls[1][2]?.method).toBe('PUT');
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    beforeEach(() => {
      // Setup MSW handlers for successful flow
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          const body = (await request.json()) as any;
          return HttpResponse.json(body);
        })
      );
    });

    it('should use PUT method for config update', async () => {
      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      const calls = getSpy().mock.calls;
      const putCall = calls.find((call: any) => call[2]?.method === 'PUT');
      expect(putCall).toBeDefined();
      expect(putCall[2].method).toBe('PUT');
    });

    it('should pass correct scopes to auth', async () => {
      await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      expect(getSpy()).toHaveBeenCalledWith(expect.any(String), ['fr:idm:*'], expect.anything());
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return _id and name from response', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          const body = (await request.json()) as any;
          return HttpResponse.json(body);
        })
      );

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      const text = result.content[0].text;
      const responseData = JSON.parse(text);
      expect(responseData._id).toBeDefined();
      expect(typeof responseData._id).toBe('string');
      expect(responseData.name).toBe('NewTheme');
    });

    it('should format successful response', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          const body = (await request.json()) as any;
          return HttpResponse.json(body);
        })
      );

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'NewTheme' }
      });

      const text = result.content[0].text;
      const responseData = JSON.parse(text);
      expect(responseData.message).toContain('Created theme "NewTheme"');
      expect(responseData.message).toContain('alpha');
      expect(responseData._id).toBeDefined();
      expect(responseData.name).toBe('NewTheme');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject invalid realm enum', () => {
      const schema = createThemeTool.inputSchema.realm;
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('should accept all valid realm enum values', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          const body = (await request.json()) as any;
          return HttpResponse.json(body);
        })
      );

      const result = await createThemeTool.toolFunction({
        realm: 'bravo',
        themeData: { name: 'BravoTheme' }
      });

      expect(result.content[0].text).toContain('BravoTheme');
    });

    it('should require themeData parameter', () => {
      const schema = createThemeTool.inputSchema.themeData;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should accept themeData as any object', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          const body = (await request.json()) as any;
          return HttpResponse.json(body);
        })
      );

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: {
          name: 'Test',
          arbitrary: 'fields',
          are: 'allowed'
        }
      });

      expect(result.content[0].text).toContain('Created theme');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'Test' }
      });

      expect(result.content[0].text).toContain('Failed to create theme in realm "alpha"');
    });

    it('should handle network/fetch error during GET', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.error();
        })
      );

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'Test' }
      });

      expect(result.content[0].text).toContain('Failed to create theme in realm "alpha"');
    });

    it('should handle network/fetch error during PUT', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.error();
        })
      );

      const result = await createThemeTool.toolFunction({
        realm: 'alpha',
        themeData: { name: 'Test' }
      });

      expect(result.content[0].text).toContain('Failed to create theme in realm "alpha"');
    });
  });
});
