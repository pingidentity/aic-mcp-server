import { describe, it, expect } from 'vitest';
import { deleteScriptTool } from '../../../src/tools/am/deleteScript.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteScript', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteScript', deleteScriptTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with encoded scriptId', async () => {
      await deleteScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/alpha/scripts/script-123');
      expect(scopes).toEqual(['fr:am:*']);
    });

    it('should use DELETE method', async () => {
      await deleteScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('DELETE');
    });

    it('should include AM_SCRIPT_HEADERS_V2', async () => {
      await deleteScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.0,resource=1.0');
    });

    it('should URL-encode scriptId with special characters', async () => {
      await deleteScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script with spaces',
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('script%20with%20spaces');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format success message with scriptId and transaction ID', async () => {
      const result = await deleteScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      expect(result.content[0].text).toContain('script-123');
      expect(result.content[0].text).toContain('deleted successfully');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => deleteScriptTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should validate scriptId with safePathSegmentSchema', () => {
      const schema = deleteScriptTool.inputSchema.scriptId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('valid-script-id')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 404, desc: '404 Not Found' },
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.delete('https://*/am/json/*/scripts/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await deleteScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'nonexistent',
      });

      expect(result.content[0].text).toContain('Failed to delete script');
    });
  });
});
