import { describe, it, expect } from 'vitest';
import { createCorsPolicyTool } from '../../../src/tools/am/createCorsPolicy.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

const validInput = {
  acceptedOrigins: ['https://example.org'],
  acceptedMethods: ['GET', 'POST'],
  acceptedHeaders: ['Content-Type'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
  allowCredentials: true,
  enabled: true
};

describe('createCorsPolicy', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createCorsPolicy', createCorsPolicyTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with ?_action=create against the global CorsService endpoint', async () => {
      await createCorsPolicyTool.toolFunction(validInput);

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/global-config/services/CorsService/configuration');
      expect(url).toContain('_action=create');
    });

    it('should use POST method', async () => {
      await createCorsPolicyTool.toolFunction(validInput);

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('POST');
    });

    it('should include Accept-API-Version: resource=1.0 header', async () => {
      await createCorsPolicyTool.toolFunction(validInput);

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('resource=1.0');
    });

    it('should pass fr:am:* scopes', async () => {
      await createCorsPolicyTool.toolFunction(validInput);

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });

    it('should round-trip all seven fields in the request body', async () => {
      await createCorsPolicyTool.toolFunction(validInput);

      const body = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(body.acceptedOrigins).toEqual(validInput.acceptedOrigins);
      expect(body.acceptedMethods).toEqual(validInput.acceptedMethods);
      expect(body.acceptedHeaders).toEqual(validInput.acceptedHeaders);
      expect(body.exposedHeaders).toEqual(validInput.exposedHeaders);
      expect(body.maxAge).toBe(validInput.maxAge);
      expect(body.allowCredentials).toBe(validInput.allowCredentials);
      expect(body.enabled).toBe(validInput.enabled);
    });

    it('should include _id in the request body when policyId is supplied', async () => {
      await createCorsPolicyTool.toolFunction({ ...validInput, policyId: 'my-custom-id' });

      const body = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(body._id).toBe('my-custom-id');
    });

    it('should omit _id from the request body when policyId is not supplied', async () => {
      await createCorsPolicyTool.toolFunction(validInput);

      const body = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(body).not.toHaveProperty('_id');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should include the server-assigned policy ID in the success text', async () => {
      server.use(
        http.post('https://*/am/json/global-config/services/CorsService/configuration', () => {
          return HttpResponse.json({ _id: 'created-policy-id' });
        })
      );

      const result = await createCorsPolicyTool.toolFunction(validInput);

      expect(result.content[0].text).toContain('created successfully');
      expect(result.content[0].text).toContain('created-policy-id');
      expect(result.content[0].text).toContain('Transaction ID:');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject non-array acceptedOrigins', () => {
      expect(() => createCorsPolicyTool.inputSchema.acceptedOrigins.parse('https://example.org')).toThrow();
    });

    it('should reject non-array acceptedMethods', () => {
      expect(() => createCorsPolicyTool.inputSchema.acceptedMethods.parse('GET')).toThrow();
    });

    it('should reject non-array acceptedHeaders', () => {
      expect(() => createCorsPolicyTool.inputSchema.acceptedHeaders.parse({})).toThrow();
    });

    it('should reject non-array exposedHeaders', () => {
      expect(() => createCorsPolicyTool.inputSchema.exposedHeaders.parse(null)).toThrow();
    });

    it('should reject non-integer maxAge', () => {
      expect(() => createCorsPolicyTool.inputSchema.maxAge.parse(3.14)).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.maxAge.parse('600')).toThrow();
    });

    it('should reject negative maxAge', () => {
      expect(() => createCorsPolicyTool.inputSchema.maxAge.parse(-1)).toThrow();
    });

    it('should reject non-boolean allowCredentials', () => {
      expect(() => createCorsPolicyTool.inputSchema.allowCredentials.parse('true')).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.allowCredentials.parse(1)).toThrow();
    });

    it('should reject non-boolean enabled', () => {
      expect(() => createCorsPolicyTool.inputSchema.enabled.parse('true')).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.enabled.parse(0)).toThrow();
    });

    it('should require each field (undefined rejected)', () => {
      expect(() => createCorsPolicyTool.inputSchema.acceptedOrigins.parse(undefined)).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.acceptedMethods.parse(undefined)).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.acceptedHeaders.parse(undefined)).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.exposedHeaders.parse(undefined)).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.maxAge.parse(undefined)).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.allowCredentials.parse(undefined)).toThrow();
      expect(() => createCorsPolicyTool.inputSchema.enabled.parse(undefined)).toThrow();
    });

    it('should accept optional policyId and reject path traversal', () => {
      expect(createCorsPolicyTool.inputSchema.policyId.parse(undefined)).toBeUndefined();
      expect(() => createCorsPolicyTool.inputSchema.policyId.parse('my-policy')).not.toThrow();
      expect(() => createCorsPolicyTool.inputSchema.policyId.parse('../etc/passwd')).toThrow(/path traversal/);
    });

    it('should accept valid fields', () => {
      expect(() => createCorsPolicyTool.inputSchema.acceptedOrigins.parse(['https://example.org'])).not.toThrow();
      expect(() => createCorsPolicyTool.inputSchema.maxAge.parse(600)).not.toThrow();
      expect(() => createCorsPolicyTool.inputSchema.allowCredentials.parse(true)).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 400, desc: '400 Bad Request' },
      { status: 401, desc: '401 Unauthorized' }
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.post('https://*/am/json/global-config/services/CorsService/configuration', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await createCorsPolicyTool.toolFunction(validInput);

      expect(result.content[0].text).toContain('Failed to create CORS policy');
    });
  });
});
