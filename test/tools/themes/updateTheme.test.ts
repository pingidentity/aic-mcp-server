import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';
import { updateThemeTool } from '../../../src/tools/themes/updateTheme.js';

describe('updateTheme', () => {
  let makeAuthenticatedRequestSpy: any;

  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    makeAuthenticatedRequestSpy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
  });

  afterEach(() => {
    makeAuthenticatedRequestSpy.mockRestore();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateTheme', updateThemeTool);
  });

  // ===== APPLICATION LOGIC TESTS (Complex Multi-Step Process) =====
  describe('Application Logic (Multi-Step Process)', () => {
    it('should reject updates to _id field', async () => {
      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { _id: 'new-id' },
      });

      // Our code pre-validates protected fields before API call
      expect(result.content[0].text).toContain('Cannot update the "_id" field');
      expect(result.content[0].text).toContain('immutable');
      expect(makeAuthenticatedRequestSpy).not.toHaveBeenCalled();
    });

    it('should reject updates to isDefault field', async () => {
      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { isDefault: true },
      });

      // Our code pre-validates protected fields before API call
      expect(result.content[0].text).toContain('Cannot update "isDefault" directly');
      expect(result.content[0].text).toContain('Use the setDefaultTheme tool');
      expect(makeAuthenticatedRequestSpy).not.toHaveBeenCalled();
    });

    it('should fetch current theme config first', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ExistingTheme', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedTheme' },
      });

      // Our code GET config before updating
      const calls = makeAuthenticatedRequestSpy.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toContain('/openidm/config/ui/themerealm');
      // First call should not have method specified (defaults to GET)
      expect(calls[0][2]).toBeUndefined();
    });

    it('should validate config structure exists', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedTheme' },
      });

      expect(result.content[0].text).toContain('Invalid theme configuration structure for realm "alpha"');
    });

    it('should validate realm exists in config', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              bravo: [],
            },
          });
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedTheme' },
      });

      expect(result.content[0].text).toContain('Invalid theme configuration structure for realm "alpha"');
    });

    it('should find theme by ID', async () => {
      let capturedPutBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'OriginalName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedPutBody = await request.json();
          return HttpResponse.json(capturedPutBody);
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123', // Search by ID
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(capturedPutBody).not.toBeNull();
      expect(capturedPutBody.realm.alpha[0]._id).toBe('theme-123');
      expect(capturedPutBody.realm.alpha[0].name).toBe('UpdatedName');
    });

    it('should find theme by name', async () => {
      let capturedPutBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'OriginalName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedPutBody = await request.json();
          return HttpResponse.json(capturedPutBody);
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'OriginalName', // Search by name
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(capturedPutBody).not.toBeNull();
      expect(capturedPutBody.realm.alpha[0]._id).toBe('theme-123');
      expect(capturedPutBody.realm.alpha[0].name).toBe('UpdatedName');
    });

    it('should return error when theme not found', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-456', name: 'OtherTheme', isDefault: false },
              ],
              bravo: [],
            },
          });
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'nonexistent',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(result.content[0].text).toContain('Theme not found: "nonexistent" in realm "alpha"');
    });

    it('should check for duplicate name when renaming', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeToUpdate', isDefault: false },
                { _id: 'theme-456', name: 'ExistingName', isDefault: false },
              ],
              bravo: [],
            },
          });
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'ExistingName' }, // Trying to use existing name
      });

      expect(result.content[0].text).toContain('Theme with name "ExistingName" already exists in realm "alpha"');
      expect(result.content[0].text).toContain('Choose a different name');
    });

    it('should allow same name when not actually changing it', async () => {
      let capturedPutBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedPutBody = await request.json();
          return HttpResponse.json(capturedPutBody);
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'ThemeName', primaryColor: '#ff0000' }, // Same name, different field
      });

      expect(capturedPutBody).not.toBeNull();
      expect(capturedPutBody.realm.alpha[0].name).toBe('ThemeName');
      expect(capturedPutBody.realm.alpha[0].primaryColor).toBe('#ff0000');
    });

    it('should merge themeUpdates with existing theme', async () => {
      let capturedPutBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                {
                  _id: 'theme-123',
                  name: 'OriginalName',
                  isDefault: false,
                  primaryColor: '#0066cc',
                  logoUrl: 'https://old.url',
                },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedPutBody = await request.json();
          return HttpResponse.json(capturedPutBody);
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: {
          logoUrl: 'https://new.url', // Update existing field
          secondaryColor: '#ff0000', // Add new field
        },
      });

      expect(capturedPutBody.realm.alpha[0]._id).toBe('theme-123');
      expect(capturedPutBody.realm.alpha[0].name).toBe('OriginalName'); // Preserved
      expect(capturedPutBody.realm.alpha[0].primaryColor).toBe('#0066cc'); // Preserved
      expect(capturedPutBody.realm.alpha[0].logoUrl).toBe('https://new.url'); // Updated
      expect(capturedPutBody.realm.alpha[0].secondaryColor).toBe('#ff0000'); // Added
    });

    it('should preserve other themes in realm', async () => {
      let capturedPutBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeToUpdate', isDefault: false },
                { _id: 'theme-456', name: 'OtherTheme', isDefault: true },
                { _id: 'theme-789', name: 'ThirdTheme', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedPutBody = await request.json();
          return HttpResponse.json(capturedPutBody);
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      // Our code preserves all other themes
      expect(capturedPutBody.realm.alpha).toHaveLength(3);
      expect(capturedPutBody.realm.alpha[0].name).toBe('UpdatedName'); // Updated
      expect(capturedPutBody.realm.alpha[1]).toEqual({
        _id: 'theme-456',
        name: 'OtherTheme',
        isDefault: true,
      }); // Preserved
      expect(capturedPutBody.realm.alpha[2]).toEqual({
        _id: 'theme-789',
        name: 'ThirdTheme',
        isDefault: false,
      }); // Preserved
    });

    it('should preserve other realms in config', async () => {
      let capturedPutBody: any = null;

      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'AlphaTheme', isDefault: false },
              ],
              bravo: [
                { _id: 'theme-456', name: 'BravoTheme', isDefault: false },
              ],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', async ({ request }) => {
          capturedPutBody = await request.json();
          return HttpResponse.json(capturedPutBody);
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedAlphaTheme' },
      });

      // Our code preserves bravo realm
      expect(capturedPutBody.realm.bravo).toEqual([
        { _id: 'theme-456', name: 'BravoTheme', isDefault: false },
      ]);
    });

    it('should PUT updated config back', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'OriginalName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      // Our code PUTs config after GET
      const calls = makeAuthenticatedRequestSpy.mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1][0]).toContain('/openidm/config/ui/themerealm');
      expect(calls[1][2]?.method).toBe('PUT');
      expect(calls[1][2]?.body).toBeDefined();
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct correct GET URL for theme config', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(makeAuthenticatedRequestSpy.mock.calls[0][0]).toBe(
        'https://test.forgeblocks.com/openidm/config/ui/themerealm'
      );
    });

    it('should construct correct PUT URL for theme config', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(makeAuthenticatedRequestSpy.mock.calls[1][0]).toBe(
        'https://test.forgeblocks.com/openidm/config/ui/themerealm'
      );
    });

    it('should use PUT method for update', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(makeAuthenticatedRequestSpy.mock.calls[1][2]?.method).toBe('PUT');
    });

    it('should pass correct scopes to auth', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(makeAuthenticatedRequestSpy.mock.calls[0][1]).toEqual(['fr:idm:*']);
      expect(makeAuthenticatedRequestSpy.mock.calls[1][1]).toEqual(['fr:idm:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return _id and name from response', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'OriginalName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      const text = result.content[0].text;
      const responseData = JSON.parse(text);
      expect(responseData._id).toBe('theme-123');
      expect(responseData.name).toBe('UpdatedName');
    });

    it('should format successful response', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'OriginalName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({});
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      const text = result.content[0].text;
      expect(text).toContain('theme-123');
      expect(text).toContain('UpdatedName');
      expect(text).toContain('Updated theme');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject invalid realm enum', () => {
      const schema = updateThemeTool.inputSchema;
      expect(() => {
        schema.realm.parse('invalid');
      }).toThrow();
    });

    it('should accept all valid realm enum values', () => {
      const schema = updateThemeTool.inputSchema;
      expect(() => {
        schema.realm.parse('alpha');
      }).not.toThrow();

      expect(() => {
        schema.realm.parse('bravo');
      }).not.toThrow();
    });

    it('should require themeIdentifier parameter', () => {
      const schema = updateThemeTool.inputSchema;
      expect(() => {
        schema.themeIdentifier.parse(undefined);
      }).toThrow();
    });

    it('should require themeUpdates parameter', () => {
      const schema = updateThemeTool.inputSchema;
      expect(() => {
        schema.themeUpdates.parse(undefined);
      }).toThrow();
    });

    it('should accept themeUpdates as any object', () => {
      const schema = updateThemeTool.inputSchema;
      expect(() => {
        schema.themeUpdates.parse({ arbitrary: 'fields' });
      }).not.toThrow();
    });

    it('should accept empty themeUpdates object', () => {
      const schema = updateThemeTool.inputSchema;
      expect(() => {
        schema.themeUpdates.parse({});
      }).not.toThrow();
    });

    it('should accept themeIdentifier as string', () => {
      const schema = updateThemeTool.inputSchema;
      expect(() => {
        schema.themeIdentifier.parse('theme-123');
      }).not.toThrow();

      expect(() => {
        schema.themeIdentifier.parse('ThemeName');
      }).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error on GET', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json(
            { message: 'Unauthorized' },
            { status: 401 }
          );
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(result.content[0].text).toContain('Failed to update theme in realm "alpha"');
      expect(result.content[0].text).toMatch(/401|Unauthorized/i);
    });

    it('should handle 401 Unauthorized error on PUT', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json(
            { message: 'Unauthorized' },
            { status: 401 }
          );
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(result.content[0].text).toContain('Failed to update theme in realm "alpha"');
      expect(result.content[0].text).toMatch(/401|Unauthorized/i);
    });

    it('should handle network error during GET', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.error();
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(result.content[0].text).toContain('Failed to update theme in realm "alpha"');
    });

    it('should handle network error during PUT', async () => {
      server.use(
        http.get('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.json({
            realm: {
              alpha: [
                { _id: 'theme-123', name: 'ThemeName', isDefault: false },
              ],
              bravo: [],
            },
          });
        }),
        http.put('https://*/openidm/config/ui/themerealm', () => {
          return HttpResponse.error();
        })
      );

      const result = await updateThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
        themeUpdates: { name: 'UpdatedName' },
      });

      expect(result.content[0].text).toContain('Failed to update theme in realm "alpha"');
    });
  });
});
