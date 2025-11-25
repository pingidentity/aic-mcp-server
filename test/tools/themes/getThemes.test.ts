import { describe, it, expect } from 'vitest';
import { getThemesTool } from '../../../src/tools/themes/getThemes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getThemes', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getThemes', getThemesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with realm parameter', async () => {
      await getThemesTool.toolFunction({
        realm: 'alpha',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('realm=alpha'),
        expect.any(Array)
      );
    });

    it('should construct URL with queryFilter true', async () => {
      await getThemesTool.toolFunction({
        realm: 'alpha',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_queryFilter=true'),
        expect.any(Array)
      );
    });

    it('should construct URL with fields parameter', async () => {
      await getThemesTool.toolFunction({
        realm: 'alpha',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_fields=name%2CisDefault'),
        expect.any(Array)
      );
    });

    it('should pass correct scopes to auth', async () => {
      await getThemesTool.toolFunction({
        realm: 'alpha',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idm:*']
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format response with theme count', async () => {
      const result = await getThemesTool.toolFunction({
        realm: 'alpha',
      });

      // Our code adds a count message
      expect(result.content[0].text).toContain('Found 2 theme(s) for realm "alpha"');
      expect(result.content[0].text).toContain('Theme1');
      expect(result.content[0].text).toContain('Theme2');
    });

    it('should handle empty theme list', async () => {
      server.use(
        http.get('https://*/openidm/ui/theme/', () => {
          return HttpResponse.json({
            result: [],
            resultCount: 0,
          });
        })
      );

      const result = await getThemesTool.toolFunction({
        realm: 'alpha',
      });

      expect(result.content[0].text).toContain('Found 0 theme(s)');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject invalid realm enum', () => {
      const schema = getThemesTool.inputSchema.realm;
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('should accept all valid realm enum values', async () => {
      // Test 'bravo' realm
      await getThemesTool.toolFunction({
        realm: 'bravo',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('realm=bravo'),
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

      const result = await getThemesTool.toolFunction({
        realm: 'alpha',
      });

      expect(result.content[0].text).toContain('Failed to retrieve themes for realm "alpha"');
      expect(result.content[0].text).toContain('401');
    });
  });
});
