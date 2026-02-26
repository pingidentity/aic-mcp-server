import { describe, it, expect } from 'vitest';
import { getScriptedDecisionNodeBindingsTool } from '../../../src/tools/am/getScriptedDecisionNodeBindings.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getScriptedDecisionNodeBindings', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getScriptedDecisionNodeBindings', getScriptedDecisionNodeBindingsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL for contexts endpoint', async () => {
      await getScriptedDecisionNodeBindingsTool.toolFunction({ realm: 'alpha' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/alpha/contexts/SCRIPTED_DECISION_NODE');
    });

    it('should use GET method', async () => {
      await getScriptedDecisionNodeBindingsTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should include AM_SCRIPT_HEADERS_V2', async () => {
      await getScriptedDecisionNodeBindingsTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.0,resource=1.0');
    });

    it('should pass correct scopes', async () => {
      await getScriptedDecisionNodeBindingsTool.toolFunction({ realm: 'alpha' });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format response with bindings data', async () => {
      server.use(
        http.get('https://*/am/json/*/contexts/*', () => {
          return HttpResponse.json({
            bindings: [{ name: 'outcome', type: 'java.lang.String' }],
            allowedImports: ['java.lang.Math'],
          });
        })
      );

      const result = await getScriptedDecisionNodeBindingsTool.toolFunction({ realm: 'alpha' });
      const text = result.content[0].text;

      expect(text).toContain('bindings');
      expect(text).toContain('outcome');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => getScriptedDecisionNodeBindingsTool.inputSchema.realm.parse(undefined)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 error', async () => {
      server.use(
        http.get('https://*/am/json/*/contexts/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await getScriptedDecisionNodeBindingsTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to get scripted decision node bindings');
    });
  });
});
