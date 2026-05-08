import { describe, it, expect } from 'vitest';
import { updateCorsPolicyTool } from '../../../src/tools/am/updateCorsPolicy.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

const existingPolicy = {
  _id: 'policy-123',
  acceptedOrigins: ['https://original.example.org'],
  acceptedMethods: ['GET'],
  acceptedHeaders: ['Content-Type'],
  exposedHeaders: ['X-Existing'],
  maxAge: 300,
  allowCredentials: false,
  enabled: true
};

describe('updateCorsPolicy', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateCorsPolicy', updateCorsPolicyTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should short-circuit with "No updates provided" when no fields supplied (no network call)', async () => {
      const result = await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123'
      });

      expect(result.content[0].text).toContain('No updates provided');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should fetch the current policy first (GET then PUT)', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json(existingPolicy);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({ _id: 'policy-123' });
        })
      );

      await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        enabled: false
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[1][2]?.method).toBe('PUT');
    });

    it('should preserve unchanged fields from the fetched policy', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json(existingPolicy);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({ _id: 'policy-123' });
        })
      );

      await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        acceptedOrigins: ['https://new.example.org']
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.acceptedOrigins).toEqual(['https://new.example.org']);
      expect(putBody.acceptedMethods).toEqual(existingPolicy.acceptedMethods);
      expect(putBody.acceptedHeaders).toEqual(existingPolicy.acceptedHeaders);
      expect(putBody.exposedHeaders).toEqual(existingPolicy.exposedHeaders);
      expect(putBody.maxAge).toBe(existingPolicy.maxAge);
      expect(putBody.allowCredentials).toBe(existingPolicy.allowCredentials);
      expect(putBody.enabled).toBe(existingPolicy.enabled);
    });

    it('should not include AM metadata fields (_id, _rev, _type) in the PUT body', async () => {
      const policyWithMetadata = {
        ...existingPolicy,
        _rev: '42',
        _type: { _id: 'CorsService', name: 'CorsService', collection: true }
      };
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json(policyWithMetadata);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({ _id: 'policy-123' });
        })
      );

      await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        acceptedHeaders: ['X-Test-Header-1', 'X-Test-Header-2']
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody).not.toHaveProperty('_id');
      expect(putBody).not.toHaveProperty('_rev');
      expect(putBody).not.toHaveProperty('_type');
      expect(Object.keys(putBody).sort()).toEqual([
        'acceptedHeaders',
        'acceptedMethods',
        'acceptedOrigins',
        'allowCredentials',
        'enabled',
        'exposedHeaders',
        'maxAge'
      ]);
    });

    it('should allow updating boolean fields even when set to false', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json(existingPolicy);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({ _id: 'policy-123' });
        })
      );

      await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        enabled: false,
        allowCredentials: true
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.enabled).toBe(false);
      expect(putBody.allowCredentials).toBe(true);
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with the CorsService configuration path and encoded policyId', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json(existingPolicy);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({ _id: 'policy with spaces' });
        })
      );

      await updateCorsPolicyTool.toolFunction({
        policyId: 'policy with spaces',
        enabled: false
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/global-config/services/CorsService/configuration/');
      expect(url).toContain('policy%20with%20spaces');
    });

    it('should include Accept-API-Version: resource=1.0 header on both calls', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json(existingPolicy);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({ _id: 'policy-123' });
        })
      );

      await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        enabled: false
      });

      expect(getSpy().mock.calls[0][2]?.headers?.['accept-api-version']).toBe('resource=1.0');
      expect(getSpy().mock.calls[1][2]?.headers?.['accept-api-version']).toBe('resource=1.0');
    });

    it('should pass fr:am:* scopes on both calls', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json(existingPolicy);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({ _id: 'policy-123' });
        })
      );

      await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        enabled: false
      });

      expect(getSpy().mock.calls[0][1]).toEqual(['fr:am:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return a success message with the policy ID and transaction ID', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json(existingPolicy);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/:policyId', () => {
          return HttpResponse.json({ _id: 'policy-123' });
        })
      );

      const result = await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        enabled: false
      });

      expect(result.content[0].text).toContain('updated successfully');
      expect(result.content[0].text).toContain('policy-123');
      expect(result.content[0].text).toContain('Transaction ID:');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should validate policyId with safePathSegmentSchema', () => {
      const schema = updateCorsPolicyTool.inputSchema.policyId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('valid-policy-id')).not.toThrow();
    });

    it('should accept all seven body fields as optional (undefined allowed)', () => {
      expect(updateCorsPolicyTool.inputSchema.acceptedOrigins.parse(undefined)).toBeUndefined();
      expect(updateCorsPolicyTool.inputSchema.acceptedMethods.parse(undefined)).toBeUndefined();
      expect(updateCorsPolicyTool.inputSchema.acceptedHeaders.parse(undefined)).toBeUndefined();
      expect(updateCorsPolicyTool.inputSchema.exposedHeaders.parse(undefined)).toBeUndefined();
      expect(updateCorsPolicyTool.inputSchema.maxAge.parse(undefined)).toBeUndefined();
      expect(updateCorsPolicyTool.inputSchema.allowCredentials.parse(undefined)).toBeUndefined();
      expect(updateCorsPolicyTool.inputSchema.enabled.parse(undefined)).toBeUndefined();
    });

    it('should reject wrong types on body fields when supplied', () => {
      expect(() => updateCorsPolicyTool.inputSchema.acceptedOrigins.parse('https://example.org')).toThrow();
      expect(() => updateCorsPolicyTool.inputSchema.maxAge.parse(3.14)).toThrow();
      expect(() => updateCorsPolicyTool.inputSchema.maxAge.parse(-5)).toThrow();
      expect(() => updateCorsPolicyTool.inputSchema.enabled.parse('false')).toThrow();
      expect(() => updateCorsPolicyTool.inputSchema.allowCredentials.parse(1)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 on GET', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        enabled: false
      });

      expect(result.content[0].text).toContain('Failed to update CORS policy');
    });

    it('should handle 404 on GET (policy not found)', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await updateCorsPolicyTool.toolFunction({
        policyId: 'nonexistent',
        enabled: false
      });

      expect(result.content[0].text).toContain('Failed to update CORS policy');
    });

    it('should handle 401 on PUT', async () => {
      server.use(
        http.get('https://*/am/json/global-config/services/CorsService/configuration/*', () => {
          return HttpResponse.json(existingPolicy);
        }),
        http.put('https://*/am/json/global-config/services/CorsService/configuration/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await updateCorsPolicyTool.toolFunction({
        policyId: 'policy-123',
        enabled: false
      });

      expect(result.content[0].text).toContain('Failed to update CORS policy');
    });
  });
});
