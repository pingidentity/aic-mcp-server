import { describe, it, expect } from 'vitest';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { deleteThemeTool } from '../../../src/tools/themes/deleteTheme.js';
import { http, HttpResponse } from 'msw';
import { buildRealmConfig, mockThemeConfigHandlers } from '../../helpers/themeConfigMocks.js';
import { server } from '../../setup.js';

describe('deleteTheme', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteTheme', deleteThemeTool);
  });

  // ===== APPLICATION LOGIC TESTS (Complex Multi-Step Process) =====
  describe('Application Logic (Multi-Step Process)', () => {
    it('should fetch current theme config first', async () => {
      mockThemeConfigHandlers(
        buildRealmConfig({
          alpha: [{ _id: 'theme-123', name: 'TestTheme', isDefault: false }],
          bravo: []
        })
      );

      await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      // Our code GETs config before deleting
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

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      expect(result.content[0].text).toContain('Invalid theme configuration structure');
      expect(result.content[0].text).toContain('alpha');
    });

    it('should find theme by _id', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'FindMe', isDefault: false },
                { _id: 'theme-456', name: 'NotMe', isDefault: false }
              ],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      // Our code finds theme by _id and deletes the correct one
      expect(result.content[0].text).toContain('FindMe');
      expect(result.content[0].text).not.toContain('NotMe');
    });

    it('should find theme by name', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'FindByName', isDefault: false },
                { _id: 'theme-456', name: 'OtherTheme', isDefault: false }
              ],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'FindByName'
      });

      // Our code finds theme by name and deletes the correct one
      expect(result.content[0].text).toContain('theme-123');
      expect(result.content[0].text).toContain('FindByName');
    });

    it('should return error when theme not found', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [{ _id: 'theme-123', name: 'ExistingTheme', isDefault: false }],
              bravo: []
            }
          });
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'nonexistent'
      });

      expect(result.content[0].text).toContain('Theme not found');
      expect(result.content[0].text).toContain('nonexistent');
      expect(result.content[0].text).toContain('alpha');
    });

    it('should prevent deletion of default theme', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-default', name: 'DefaultTheme', isDefault: true },
                { _id: 'theme-other', name: 'OtherTheme', isDefault: false }
              ],
              bravo: []
            }
          });
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-default'
      });

      // Our code prevents deletion of default theme
      expect(result.content[0].text).toContain('Cannot delete the default theme');
      expect(result.content[0].text).toContain('DefaultTheme');
      expect(result.content[0].text).toContain('setDefaultTheme');
      // Should not make PUT call
      const putCalls = getSpy().mock.calls.filter((call: any) => call[2] && call[2].method === 'PUT');
      expect(putCalls.length).toBe(0);
    });

    it('should remove theme from array', async () => {
      let putBody: any = null;
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-keep1', name: 'KeepTheme1', isDefault: true },
                { _id: 'theme-delete', name: 'DeleteThis', isDefault: false },
                { _id: 'theme-keep2', name: 'KeepTheme2', isDefault: false }
              ],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          putBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-delete'
      });

      // Our code removes the theme from the array
      expect(putBody).toBeTruthy();
      expect(putBody.realm.alpha).toHaveLength(2);
      expect(putBody.realm.alpha.find((t: any) => t._id === 'theme-keep1')).toBeTruthy();
      expect(putBody.realm.alpha.find((t: any) => t._id === 'theme-keep2')).toBeTruthy();
      expect(putBody.realm.alpha.find((t: any) => t._id === 'theme-delete')).toBeUndefined();
    });

    it('should preserve other themes in array', async () => {
      let putBody: any = null;
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-1', name: 'Theme1', isDefault: true, customProp: 'value1' },
                { _id: 'theme-2', name: 'Theme2', isDefault: false, customProp: 'value2' },
                { _id: 'theme-delete', name: 'DeleteMe', isDefault: false }
              ],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          putBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-delete'
      });

      // Our code preserves all properties of other themes
      expect(putBody.realm.alpha).toHaveLength(2);
      const theme1 = putBody.realm.alpha.find((t: any) => t._id === 'theme-1');
      const theme2 = putBody.realm.alpha.find((t: any) => t._id === 'theme-2');
      expect(theme1).toEqual({ _id: 'theme-1', name: 'Theme1', isDefault: true, customProp: 'value1' });
      expect(theme2).toEqual({ _id: 'theme-2', name: 'Theme2', isDefault: false, customProp: 'value2' });
    });

    it('should preserve other realm configs', async () => {
      let putBody: any = null;
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-alpha', name: 'AlphaTheme', isDefault: true },
                { _id: 'theme-delete', name: 'DeleteThis', isDefault: false }
              ],
              bravo: [{ _id: 'theme-bravo', name: 'BravoTheme', isDefault: true }]
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          putBody = await request.json();
          return HttpResponse.json({});
        })
      );

      await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-delete'
      });

      // Our code preserves bravo realm config
      expect(putBody.realm.bravo).toHaveLength(1);
      expect(putBody.realm.bravo[0]).toEqual({
        _id: 'theme-bravo',
        name: 'BravoTheme',
        isDefault: true
      });
      // Alpha realm should only have the non-deleted theme
      expect(putBody.realm.alpha).toHaveLength(1);
      expect(putBody.realm.alpha[0]._id).toBe('theme-alpha');
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL for config endpoint on GET', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [{ _id: 'theme-123', name: 'TestTheme', isDefault: false }],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      // Our code GETs the entire config first
      const getCalls = getSpy().mock.calls.filter((call: any) => !call[2] || !call[2].method);
      expect(getCalls.length).toBeGreaterThanOrEqual(1);
      expect(getCalls[0][0]).toContain('/openidm/config/ui/themerealm');
    });

    it('should construct URL for config endpoint on PUT', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [{ _id: 'theme-123', name: 'TestTheme', isDefault: false }],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      const putCalls = getSpy().mock.calls.filter((call: any) => call[2] && call[2].method === 'PUT');
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      expect(putCalls[0][0]).toContain('/openidm/config/ui/themerealm');
    });

    it('should pass correct scopes to auth', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [{ _id: 'theme-123', name: 'TestTheme', isDefault: false }],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      expect(getSpy()).toHaveBeenCalled();
      const calls = getSpy().mock.calls;
      calls.forEach((call: any) => {
        expect(call[1]).toEqual(['fr:idm:*']);
      });
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return _id and name of deleted theme', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [{ _id: 'theme-123', name: 'DeletedTheme', isDefault: false }],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      expect(result.content[0].text).toContain('theme-123');
      expect(result.content[0].text).toContain('DeletedTheme');
    });

    it('should format successful response', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [{ _id: 'theme-456', name: 'MyTheme', isDefault: false }],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-456'
      });

      expect(result.content[0].text).toContain('Deleted theme');
      expect(result.content[0].text).toContain('MyTheme');
      expect(result.content[0].text).toContain('theme-456');
      expect(result.content[0].text).toContain('alpha');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject invalid realm enum', () => {
      const schema = deleteThemeTool.inputSchema.realm;
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('should accept all valid realm enum values', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [],
              bravo: [{ _id: 'theme-789', name: 'BravoTheme', isDefault: false }]
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      // Should not throw validation error for bravo realm
      const result = await deleteThemeTool.toolFunction({
        realm: 'bravo',
        themeIdentifier: 'theme-789'
      });

      expect(result.content[0].text).toContain('Deleted theme');
    });

    it('should require themeIdentifier parameter', () => {
      const schema = deleteThemeTool.inputSchema.themeIdentifier;
      expect(() => schema.parse(undefined)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error on GET', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      expect(result.content[0].text).toContain('Failed to delete theme');
      expect(result.content[0].text).toContain('alpha');
    });

    it('should handle 401 Unauthorized error on PUT', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [{ _id: 'theme-123', name: 'TestTheme', isDefault: false }],
              bravo: []
            }
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      expect(result.content[0].text).toContain('Failed to delete theme');
      expect(result.content[0].text).toContain('alpha');
    });

    it('should handle network/fetch error', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.error();
        })
      );

      const result = await deleteThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123'
      });

      expect(result.content[0].text).toContain('Failed to delete theme');
      expect(result.content[0].text).toContain('alpha');
    });
  });
});
