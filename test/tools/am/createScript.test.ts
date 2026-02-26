import { describe, it, expect } from 'vitest';
import { createScriptTool } from '../../../src/tools/am/createScript.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('createScript', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createScript', createScriptTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with ?_action=create', async () => {
      await createScriptTool.toolFunction({
        realm: 'alpha',
        name: 'TestScript',
        script: 'console.log("test");'
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/alpha/scripts');
      expect(url).toContain('_action=create');
    });

    it('should use POST method', async () => {
      await createScriptTool.toolFunction({
        realm: 'alpha',
        name: 'TestScript',
        script: 'console.log("test");'
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('POST');
    });

    it('should include AM_SCRIPT_HEADERS_V2', async () => {
      await createScriptTool.toolFunction({
        realm: 'alpha',
        name: 'TestScript',
        script: 'console.log("test");'
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.0,resource=1.0');
    });

    it('should pass correct scopes', async () => {
      await createScriptTool.toolFunction({
        realm: 'alpha',
        name: 'TestScript',
        script: 'console.log("test");'
      });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE PROCESSING TESTS =====
  describe('Response Processing', () => {
    it('should base64-encode script content before sending', async () => {
      const scriptContent = 'console.log("Hello World");';

      await createScriptTool.toolFunction({
        realm: 'alpha',
        name: 'TestScript',
        script: scriptContent
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      const decodedScript = Buffer.from(requestBody.script, 'base64').toString();
      expect(decodedScript).toBe(scriptContent);
    });

    it('should preserve fixed fields in request body', async () => {
      await createScriptTool.toolFunction({
        realm: 'alpha',
        name: 'TestScript',
        script: 'console.log("test");'
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody.context).toBe('AUTHENTICATION_TREE_DECISION_NODE');
      expect(requestBody.language).toBe('JAVASCRIPT');
      expect(requestBody.evaluatorVersion).toBe('2.0');
      expect(requestBody.name).toBe('TestScript');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => createScriptTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should require name parameter (min length 1)', () => {
      expect(() => createScriptTool.inputSchema.name.parse('')).toThrow();
      expect(() => createScriptTool.inputSchema.name.parse('ValidName')).not.toThrow();
    });

    it('should require script parameter (min length 1)', () => {
      expect(() => createScriptTool.inputSchema.script.parse('')).toThrow();
      expect(() => createScriptTool.inputSchema.script.parse('var x = 1;')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 400, desc: '400 Bad Request' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.post('https://*/am/json/*/scripts', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await createScriptTool.toolFunction({
        realm: 'alpha',
        name: 'TestScript',
        script: 'code'
      });

      expect(result.content[0].text).toContain('Failed to create script');
    });
  });
});
