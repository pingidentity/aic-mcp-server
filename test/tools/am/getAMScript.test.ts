import { describe, it, expect } from 'vitest';
import { getAMScriptTool } from '../../../src/tools/am/getAMScript.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getAMScript', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getAMScript', getAMScriptTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with realm and script ID', async () => {
      await getAMScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/alpha/scripts/script-123');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=1.0,resource=1.0');
    });

    it('should URL-encode script ID', async () => {
      await getAMScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script with spaces',
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('script%20with%20spaces');
    });
  });

  // ===== RESPONSE PROCESSING TESTS =====
  describe('Response Processing', () => {
    it('should decode base64 script content', async () => {
      const scriptContent = 'console.log("Hello World");';
      const base64Content = Buffer.from(scriptContent).toString('base64');

      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({
            _id: 'script-123',
            name: 'TestScript',
            script: base64Content,
            language: 'JAVASCRIPT',
          });
        })
      );

      const result = await getAMScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.script).toBe(scriptContent);
    });

    it('should preserve other script fields', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({
            _id: 'script-123',
            name: 'TestScript',
            description: 'A test script',
            script: Buffer.from('test').toString('base64'),
            language: 'JAVASCRIPT',
            context: 'AUTHENTICATION_TREE_DECISION_NODE',
          });
        })
      );

      const result = await getAMScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData._id).toBe('script-123');
      expect(responseData.name).toBe('TestScript');
      expect(responseData.description).toBe('A test script');
      expect(responseData.language).toBe('JAVASCRIPT');
      expect(responseData.context).toBe('AUTHENTICATION_TREE_DECISION_NODE');
    });

    it('should handle script without base64 encoding', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({
            _id: 'script-123',
            name: 'TestScript',
            script: 'not-base64-content!!!',
            language: 'JAVASCRIPT',
          });
        })
      );

      const result = await getAMScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      const responseData = JSON.parse(result.content[0].text);
      // Should preserve original if not valid base64
      expect(responseData.script).toBeDefined();
    });

    it('should handle missing script field', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({
            _id: 'script-123',
            name: 'EmptyScript',
            language: 'JAVASCRIPT',
          });
        })
      );

      const result = await getAMScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData._id).toBe('script-123');
      expect(responseData.name).toBe('EmptyScript');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => getAMScriptTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should reject invalid realm', () => {
      expect(() => getAMScriptTool.inputSchema.realm.parse('invalid')).toThrow();
    });

    it('should use safePathSegmentSchema for scriptId', () => {
      const schema = getAMScriptTool.inputSchema.scriptId;
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
        http.get('https://*/am/json/*/scripts/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await getAMScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'nonexistent',
      });

      expect(result.content[0].text).toContain('Failed to get script');
    });
  });
});
