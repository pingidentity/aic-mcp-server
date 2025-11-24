import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getThemeTool } from '../../../src/tools/themes/getTheme.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('getTheme', () => {
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
    await snapshotTest('getTheme', getThemeTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with realm and themeIdentifier', async () => {
      await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      // Our code builds OR query filter: _id eq "X" or name eq "X"
      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('realm=alpha'),
        expect.any(Array)
      );
      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_queryFilter='),
        expect.any(Array)
      );
      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_id%20eq%20%22theme-123%22%20or%20name%20eq%20%22theme-123%22'),
        expect.any(Array)
      );
    });

    it('should properly encode themeIdentifier in query', async () => {
      await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'Theme Name With Spaces',
      });

      const encodedIdentifier = encodeURIComponent('Theme Name With Spaces');
      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining(encodedIdentifier),
        expect.any(Array)
      );
    });

    it('should escape double quotes in themeIdentifier', async () => {
      await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'test"quote',
      });

      // Double quote becomes %22 when URL-encoded
      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('test%22quote'),
        expect.any(Array)
      );
    });

    it('should pass correct scopes to auth', async () => {
      await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idm:*']
      );
    });
  });

  // ===== RESPONSE PROCESSING TESTS =====
  describe('Response Processing (Application Logic)', () => {
    it('should return error when result count is 0', async () => {
      server.use(
        http.get('https://*/openidm/ui/theme/', () => {
          return HttpResponse.json({
            resultCount: 0,
            result: [],
          });
        })
      );

      const result = await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'nonexistent',
      });

      expect(result.content[0].text).toContain('Theme not found: "nonexistent" in realm "alpha"');
    });

    it('should return error when multiple themes match', async () => {
      server.use(
        http.get('https://*/openidm/ui/theme/', () => {
          return HttpResponse.json({
            resultCount: 2,
            result: [
              { _id: 'theme-1', name: 'duplicate' },
              { _id: 'theme-2', name: 'duplicate' },
            ],
          });
        })
      );

      const result = await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'duplicate',
      });

      expect(result.content[0].text).toContain('Multiple themes found matching "duplicate"');
      expect(result.content[0].text).toContain('This should not happen');
      expect(result.content[0].text).toContain('report this issue');
    });

    it('should extract first result from array', async () => {
      server.use(
        http.get('https://*/openidm/ui/theme/', () => {
          return HttpResponse.json({
            resultCount: 1,
            result: [
              {
                _id: 'theme-123',
                name: 'My Theme',
                isDefault: false,
                primaryColor: '#0066cc',
              },
            ],
          });
        })
      );

      const result = await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      const text = result.content[0].text;
      const jsonText = text.split('\n\nTransaction ID:')[0];
      const themeData = JSON.parse(jsonText);

      expect(themeData._id).toBe('theme-123');
      expect(themeData.name).toBe('My Theme');
      expect(themeData.primaryColor).toBe('#0066cc');
      // Verify we got the object, not the array
      expect(Array.isArray(themeData)).toBe(false);
    });

    it('should handle missing resultCount field', async () => {
      server.use(
        http.get('https://*/openidm/ui/theme/', () => {
          return HttpResponse.json({
            result: [],
          });
        })
      );

      const result = await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content[0].text).toContain('Theme not found');
    });

    it('should handle missing result array', async () => {
      server.use(
        http.get('https://*/openidm/ui/theme/', () => {
          return HttpResponse.json({
            resultCount: 0,
          });
        })
      );

      const result = await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content[0].text).toContain('Theme not found');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject invalid realm enum', () => {
      const schema = getThemeTool.inputSchema.realm;
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('should accept all valid realm enum values', async () => {
      // Test 'bravo' realm
      await getThemeTool.toolFunction({
        realm: 'bravo',
        themeIdentifier: 'theme-456',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('realm=bravo'),
        expect.any(Array)
      );
    });

    it('should require themeIdentifier parameter', () => {
      const schema = getThemeTool.inputSchema.themeIdentifier;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should accept any string for themeIdentifier', async () => {
      // Our code doesn't validate format - API determines if valid
      await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'any-string-123_ABC',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('any-string-123_ABC'),
        expect.any(Array)
      );
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/openidm/ui/theme/', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized' }),
            { status: 401 }
          );
        })
      );

      const result = await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'theme-123',
      });

      expect(result.content[0].text).toContain('Failed to retrieve theme');
      expect(result.content[0].text).toContain('theme-123');
      expect(result.content[0].text).toContain('alpha');
    });

    it('should handle 404 Not Found error', async () => {
      server.use(
        http.get('https://*/openidm/ui/theme/', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'not_found' }),
            { status: 404 }
          );
        })
      );

      const result = await getThemeTool.toolFunction({
        realm: 'alpha',
        themeIdentifier: 'nonexistent',
      });

      expect(result.content[0].text).toContain('Failed to retrieve theme');
      expect(result.content[0].text).toContain('nonexistent');
    });
  });
});
