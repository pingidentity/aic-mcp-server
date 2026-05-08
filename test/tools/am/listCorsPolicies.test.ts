import { describe, it, expect } from 'vitest';
import { listCorsPoliciesTool } from '../../../src/tools/am/listCorsPolicies.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listCorsPolicies', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listCorsPolicies', listCorsPoliciesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL pointing at the global CorsService configuration endpoint', async () => {
      await listCorsPoliciesTool.toolFunction();

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/global-config/services/CorsService/configuration');
    });

    it('should include _queryFilter=true', async () => {
      await listCorsPoliciesTool.toolFunction();

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('_queryFilter=true');
    });

    it('should use GET method', async () => {
      await listCorsPoliciesTool.toolFunction();

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should include Accept-API-Version: resource=1.0 header', async () => {
      await listCorsPoliciesTool.toolFunction();

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('resource=1.0');
    });

    it('should pass fr:am:* scopes', async () => {
      await listCorsPoliciesTool.toolFunction();

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return success response text with data', async () => {
      const result = await listCorsPoliciesTool.toolFunction();

      expect(result.content[0].text).toBeDefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should expose an empty input schema (no required fields)', () => {
      expect(listCorsPoliciesTool.inputSchema).toEqual({});
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 500, desc: '500 Internal Server Error' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration*', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await listCorsPoliciesTool.toolFunction();

      expect(result.content[0].text).toContain('Failed to list CORS policies');
    });
  });
});
