import { describe, it, expect } from 'vitest';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { setDefaultThemeTool } from '../../../src/tools/themes/setDefaultTheme.js';
import { http, HttpResponse } from 'msw';
import { buildRealmConfig, mockThemeConfigHandlers } from '../../helpers/themeConfigMocks.js';
import { server } from '../../setup.js';

describe('setDefaultTheme', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setDefaultTheme', setDefaultThemeTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should find theme by ID', async () => {
      mockThemeConfigHandlers(buildRealmConfig({
        alpha: [
          { _id: 'theme-123', name: 'TestTheme', isDefault: false },
          { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
        ],
        bravo: [],
      }));

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content[0].text).toContain('TestTheme');
      expect(result.content[0].text).toContain('theme-123');
    });

    it('should find theme by name', async () => {
      mockThemeConfigHandlers(buildRealmConfig({
        alpha: [
          { _id: 'theme-123', name: 'TestTheme', isDefault: false },
          { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
        ],
        bravo: [],
      }));

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'TestTheme',
      });

      expect(result.content[0].text).toContain('TestTheme');
      expect(result.content[0].text).toContain('theme-123');
    });

    it('should return error for theme not found', async () => {
      mockThemeConfigHandlers(buildRealmConfig({
        alpha: [{ _id: 'theme-456', name: 'CurrentDefault', isDefault: true }],
        bravo: [],
      }));

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'nonexistent',
      });

      expect(result.content[0].text).toContain('not found');
      expect(result.content[0].text).toContain('nonexistent');
    });

    it('should set target theme isDefault to true', async () => {
      let capturedBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(capturedBody).not.toBeNull();
      const targetTheme = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-123');
      expect(targetTheme.isDefault).toBe(true);
    });

    it('should set old default theme isDefault to false', async () => {
      let capturedBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(capturedBody).not.toBeNull();
      const oldDefaultTheme = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-456');
      expect(oldDefaultTheme.isDefault).toBe(false);
    });

    it('should preserve all theme properties except isDefault', async () => {
      let capturedBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                {
                  _id: 'theme-123',
                  name: 'TestTheme',
                  isDefault: false,
                  backgroundColor: '#ffffff',
                  logo: 'logo.png',
                  customField: 'customValue'
                },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(capturedBody).not.toBeNull();
      const targetTheme = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-123');
      expect(targetTheme._id).toBe('theme-123');
      expect(targetTheme.name).toBe('TestTheme');
      expect(targetTheme.backgroundColor).toBe('#ffffff');
      expect(targetTheme.logo).toBe('logo.png');
      expect(targetTheme.customField).toBe('customValue');
      expect(targetTheme.isDefault).toBe(true);
    });

    it('should preserve themes in other realms', async () => {
      let capturedBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [
                { _id: 'bravo-theme-1', name: 'BravoTheme', isDefault: true },
              ],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.realm.bravo).toHaveLength(1);
      expect(capturedBody.realm.bravo[0]._id).toBe('bravo-theme-1');
      expect(capturedBody.realm.bravo[0].isDefault).toBe(true);
    });

    it('should preserve non-target themes in same realm', async () => {
      let capturedBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
                { _id: 'theme-789', name: 'ThirdTheme', isDefault: false, customProp: 'value' },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.realm.alpha).toHaveLength(3);
      const thirdTheme = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-789');
      expect(thirdTheme.name).toBe('ThirdTheme');
      expect(thirdTheme.customProp).toBe('value');
      expect(thirdTheme.isDefault).toBe(false);
    });

    it('should preserve other config properties', async () => {
      let capturedBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            _id: 'ui/themerealm',
            _rev: '12345',
            otherConfigProp: 'value',
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody._id).toBe('ui/themerealm');
      expect(capturedBody._rev).toBe('12345');
      expect(capturedBody.otherConfigProp).toBe('value');
    });

    it.each([
      { name: 'should handle invalid config structure - missing realm property', config: { _id: 'ui/themerealm' } },
      { name: 'should handle invalid config structure - missing specific realm', config: buildRealmConfig({ bravo: [] }) },
    ])('$name', async ({ config }) => {
      mockThemeConfigHandlers(config as any);

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content[0].text).toContain('Invalid theme configuration');
      expect(result.content[0].text).toContain('alpha');
    });

    it('should handle empty themes array in realm', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: [],
            },
          });
        })
      );

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content[0].text).toContain('not found');
      expect(result.content[0].text).toContain('theme-123');
    });

    it('should handle realm with no default theme', async () => {
      let capturedBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'OtherTheme', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(capturedBody).not.toBeNull();
      const targetTheme = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-123');
      expect(targetTheme.isDefault).toBe(true);

      // Other theme should still be false
      const otherTheme = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-456');
      expect(otherTheme.isDefault).toBe(false);
    });

    it('should handle realm with multiple themes marked as default', async () => {
      let capturedBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'Default1', isDefault: true },
                { _id: 'theme-789', name: 'Default2', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(capturedBody).not.toBeNull();
      // Our code should set ALL themes to false except the target
      const targetTheme = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-123');
      expect(targetTheme.isDefault).toBe(true);

      const default1 = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-456');
      expect(default1.isDefault).toBe(false);

      const default2 = capturedBody.realm.alpha.find((t: any) => t._id === 'theme-789');
      expect(default2.isDefault).toBe(false);
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL for config endpoint on GET', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      // Our code GETs the entire config first
      const getCalls = getSpy().mock.calls.filter(
        (call: any) => !call[2] || !call[2].method
      );
      expect(getCalls.length).toBeGreaterThanOrEqual(1);
      expect(getCalls[0][0]).toBe('https://test.forgeblocks.com/openidm/config/ui/themerealm');
    });

    it('should construct URL for config endpoint on PUT', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      const putCalls = getSpy().mock.calls.filter(
        (call: any) => call[2] && call[2].method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      expect(putCalls[0][0]).toBe('https://test.forgeblocks.com/openidm/config/ui/themerealm');
    });

    it('should use PUT method', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      const putCalls = getSpy().mock.calls.filter(
        (call: any) => call[2] && call[2].method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      expect(putCalls[0][2].method).toBe('PUT');
    });

    it('should pass correct scopes to auth', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      // Both GET and PUT should use correct scopes
      expect(getSpy().mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(getSpy().mock.calls[0][1]).toEqual(['fr:idm:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:idm:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const responseText = result.content[0].text;
      expect(responseText).toContain('TestTheme');
      expect(responseText).toContain('theme-123');
      expect(responseText).toContain('alpha');
    });

    it('should handle already-default theme gracefully', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'AlreadyDefault', isDefault: true },
                { _id: 'theme-456', name: 'OtherTheme', isDefault: false },
              ],
              bravo: [],
            },
          });
        })
      );

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const responseText = result.content[0].text;
      expect(responseText).toContain('already the default');
      expect(responseText).toContain('AlreadyDefault');

      // Should NOT have made a PUT request
      const putCalls = getSpy().mock.calls.filter(
        (call: any) => call[2] && call[2].method === 'PUT'
      );
      expect(putCalls.length).toBe(0);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject invalid realm enum', () => {
      expect(() => {
        setDefaultThemeTool.inputSchema.realm.parse('invalid');
      }).toThrow();
    });

    it('should accept all valid realm enum values', () => {
      expect(() => {
        setDefaultThemeTool.inputSchema.realm.parse('alpha');
      }).not.toThrow();

      expect(() => {
        setDefaultThemeTool.inputSchema.realm.parse('bravo');
      }).not.toThrow();
    });

    it('should require themeIdentifier parameter', () => {
      expect(() => {
        setDefaultThemeTool.inputSchema.themeIdentifier.parse(undefined);
      }).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        })
      );

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content[0].text).toContain('Failed to set default theme');
      expect(result.content[0].text).toContain('alpha');
    });

    it('should handle 404 Not Found error', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json(
            { error: 'Not Found' },
            { status: 404 }
          );
        })
      );

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'nonexistent',
      });

      expect(result.content[0].text).toContain('Failed to set default theme');
      expect(result.content[0].text).toContain('alpha');
    });

    it('should handle PUT error when updating config', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'TestTheme', isDefault: false },
                { _id: 'theme-456', name: 'CurrentDefault', isDefault: true },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
          );
        })
      );

      const result = await setDefaultThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content[0].text).toContain('Failed to set default theme');
      expect(result.content[0].text).toContain('alpha');
    });
  });
});
