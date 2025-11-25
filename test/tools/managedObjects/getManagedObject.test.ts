import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getManagedObjectTool } from '../../../src/tools/managedObjects/getManagedObject.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('getManagedObject', () => {
  let makeAuthenticatedRequestSpy: any;

  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    makeAuthenticatedRequestSpy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
  });

  afterEach(() => {
    makeAuthenticatedRequestSpy.mockRestore();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getManagedObject', getManagedObjectTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with objectType and objectId', async () => {
      await getManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/openidm/managed/alpha_user/obj-123',
        ['fr:idm:*']
      );
    });

    it('should pass correct scopes to auth', async () => {
      await getManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idm:*']
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response with full object', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType/:objectId', ({ request, params }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }

          return HttpResponse.json({
            _id: params.objectId as string,
            _rev: '1',
            userName: 'test',
            mail: 'test@example.com',
            givenName: 'Test',
            sn: 'User',
          });
        })
      );

      const result = await getManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(result.content[0].text).toContain('obj-123');
      expect(result.content[0].text).toContain('_rev');
      expect(result.content[0].text).toContain('userName');
      expect(result.content[0].type).toBe('text');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty objectType string', () => {
      const schema = getManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept standard object types', () => {
      const schema = getManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('bravo_role')).not.toThrow();
    });

    it('should accept any non-empty object type string', () => {
      const schema = getManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_device')).not.toThrow();
      expect(() => schema.parse('custom_application')).not.toThrow();
    });

    it('should reject objectId with path traversal', () => {
      const schema = getManagedObjectTool.inputSchema.objectId;

      // Test various path traversal patterns
      expect(() => schema.parse('../../../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('../../admin')).toThrow(/path traversal/);
      expect(() => schema.parse('obj/../admin')).toThrow(/path traversal/);
    });

    it('should reject objectId with forward slash', () => {
      const schema = getManagedObjectTool.inputSchema.objectId;

      // Forward slash can be used for path traversal
      expect(() => schema.parse('obj/123')).toThrow(/path traversal/);
      expect(() => schema.parse('/etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('obj/../../admin')).toThrow(/path traversal/);
    });

    it('should reject objectId with backslash', () => {
      const schema = getManagedObjectTool.inputSchema.objectId;

      // Backslash can be used for path traversal on Windows
      expect(() => schema.parse('obj\\123')).toThrow(/path traversal/);
      expect(() => schema.parse('obj\\..\\admin')).toThrow(/path traversal/);
      expect(() => schema.parse('..\\..\\admin')).toThrow(/path traversal/);
    });

    it('should reject URL-encoded path traversal', () => {
      const schema = getManagedObjectTool.inputSchema.objectId;

      // URL-encoded variants should also be rejected
      expect(() => schema.parse('obj%2e%2e')).toThrow(/path traversal/);
      expect(() => schema.parse('%2e%2e%2fadmin')).toThrow(/path traversal/);
      expect(() => schema.parse('obj%2f123')).toThrow(/path traversal/);
      expect(() => schema.parse('obj%5c123')).toThrow(/path traversal/);
    });

    it('should reject empty objectId', () => {
      const schema = getManagedObjectTool.inputSchema.objectId;

      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('   ')).toThrow(/cannot be empty or whitespace/);
    });

    it('should accept valid objectId', () => {
      const schema = getManagedObjectTool.inputSchema.objectId;

      expect(() => schema.parse('valid-object-123')).not.toThrow();
      expect(() => schema.parse('obj_test')).not.toThrow();
      expect(() => schema.parse('abc-123-xyz_456')).not.toThrow();
      expect(() => schema.parse('uuid-1234-5678-90ab-cdef')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType/:objectId', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid token' }),
            { status: 401 }
          );
        })
      );

      const result = await getManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(result.content[0].text).toContain('Failed to retrieve managed object');
      expect(result.content[0].text).toMatch(/401|[Uu]nauthorized/);
    });

    it('should handle 404 Not Found error', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType/:objectId', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'not_found', message: 'Object does not exist' }),
            { status: 404 }
          );
        })
      );

      const result = await getManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'nonexistent',
      });

      expect(result.content[0].text).toContain('Failed to retrieve managed object');
      expect(result.content[0].text).toMatch(/404|[Nn]ot [Ff]ound/);
    });
  });
});
