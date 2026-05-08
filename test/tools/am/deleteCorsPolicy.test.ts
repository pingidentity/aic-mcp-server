import { describe, it, expect } from 'vitest';
import { deleteCorsPolicyTool } from '../../../src/tools/am/deleteCorsPolicy.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteCorsPolicy', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteCorsPolicy', deleteCorsPolicyTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with the CorsService configuration path and policyId', async () => {
      await deleteCorsPolicyTool.toolFunction({ policyId: 'policy-123' });

      const [url, scopes] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/global-config/services/CorsService/configuration/policy-123');
      expect(scopes).toEqual(['fr:am:*']);
    });

    it('should use DELETE method', async () => {
      await deleteCorsPolicyTool.toolFunction({ policyId: 'policy-123' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('DELETE');
    });

    it('should include Accept-API-Version: resource=1.0 header', async () => {
      await deleteCorsPolicyTool.toolFunction({ policyId: 'policy-123' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('resource=1.0');
    });

    it('should URL-encode policyId with special characters', async () => {
      await deleteCorsPolicyTool.toolFunction({ policyId: 'policy with spaces' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('policy%20with%20spaces');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format success message including the policy ID and a transaction ID', async () => {
      const result = await deleteCorsPolicyTool.toolFunction({ policyId: 'policy-123' });

      expect(result.content[0].text).toContain('policy-123');
      expect(result.content[0].text).toContain('deleted successfully');
      expect(result.content[0].text).toContain('Transaction ID:');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate policyId with safePathSegmentSchema', () => {
      const schema = deleteCorsPolicyTool.inputSchema.policyId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('valid-policy-id')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 404, desc: '404 Not Found' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.delete('https://*/am/json/global-config/services/CorsService/configuration/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await deleteCorsPolicyTool.toolFunction({ policyId: 'nonexistent' });

      expect(result.content[0].text).toContain('Failed to delete CORS policy');
    });
  });
});
