import { describe, it, expect } from 'vitest';
import { getCorsPolicyTool } from '../../../src/tools/am/getCorsPolicy.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getCorsPolicy', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getCorsPolicy', getCorsPolicyTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with the CorsService configuration path and the policyId', async () => {
      await getCorsPolicyTool.toolFunction({ policyId: 'policy-123' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/global-config/services/CorsService/configuration/policy-123');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('resource=1.0');
    });

    it('should use GET method', async () => {
      await getCorsPolicyTool.toolFunction({ policyId: 'policy-123' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('GET');
    });

    it('should URL-encode policyId with special characters', async () => {
      await getCorsPolicyTool.toolFunction({ policyId: 'policy with spaces' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('policy%20with%20spaces');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should pass through the policy JSON on success', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({
            _id: 'policy-123',
            acceptedOrigins: ['https://example.org'],
            acceptedMethods: ['GET'],
            acceptedHeaders: [],
            exposedHeaders: [],
            maxAge: 300,
            allowCredentials: false,
            enabled: true
          });
        })
      );

      const result = await getCorsPolicyTool.toolFunction({ policyId: 'policy-123' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed._id).toBe('policy-123');
      expect(parsed.acceptedOrigins).toEqual(['https://example.org']);
      expect(parsed.maxAge).toBe(300);
      expect(parsed.enabled).toBe(true);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate policyId with safePathSegmentSchema', () => {
      const schema = getCorsPolicyTool.inputSchema.policyId;
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
        http.get('https://*/am/json/global-config/services/CorsService/configuration/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await getCorsPolicyTool.toolFunction({ policyId: 'nonexistent' });

      expect(result.content[0].text).toContain('Failed to get CORS policy');
    });
  });
});
