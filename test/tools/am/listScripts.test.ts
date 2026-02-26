import { describe, it, expect } from 'vitest';
import { listScriptsTool } from '../../../src/tools/am/listScripts.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listScripts', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listScripts', listScriptsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with correct path', async () => {
      await listScriptsTool.toolFunction({ realm: 'alpha' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/alpha/scripts');
    });

    it('should include _queryFilter with context and evaluatorVersion', async () => {
      await listScriptsTool.toolFunction({ realm: 'alpha' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('_queryFilter=');
      expect(url).toContain('AUTHENTICATION_TREE_DECISION_NODE');
      expect(url).toContain('evaluatorVersion');
    });

    it('should include _pageSize=-1', async () => {
      await listScriptsTool.toolFunction({ realm: 'alpha' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('_pageSize=-1');
    });

    it('should include _fields parameter', async () => {
      await listScriptsTool.toolFunction({ realm: 'alpha' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('_fields=');
      expect(url).toContain('_id');
      expect(url).toContain('name');
      expect(url).toContain('description');
    });

    it('should use GET method', async () => {
      await listScriptsTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should include AM_SCRIPT_HEADERS_V2', async () => {
      await listScriptsTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.0,resource=1.0');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response with data', async () => {
      const result = await listScriptsTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toBeDefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => listScriptsTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should reject invalid realm', () => {
      expect(() => listScriptsTool.inputSchema.realm.parse('invalid')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 error', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await listScriptsTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to list scripts');
    });
  });
});
