import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { deleteManagedObjectTool } from '../../../src/tools/managedObjects/deleteManagedObject.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('deleteManagedObject', () => {
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
    await snapshotTest('deleteManagedObject', deleteManagedObjectTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with objectType and objectId', async () => {
      await deleteManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/openidm/managed/alpha_user/obj-123',
        ['fr:idm:*'],
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should use DELETE method', async () => {
      await deleteManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should pass correct scopes to auth', async () => {
      await deleteManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idm:*'],
        expect.any(Object)
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response with deleted ID', async () => {
      server.use(
        http.delete('https://*/openidm/managed/:objectType/:objectId', ({ request, params }) => {
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
          });
        })
      );

      const result = await deleteManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(result.content[0].text).toContain('Deleted managed object');
      expect(result.content[0].text).toContain('obj-123');
      expect(result.content[0].text).toContain('alpha_user');
      expect(result.content[0].type).toBe('text');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty objectType string', () => {
      const schema = deleteManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept standard object types', () => {
      const schema = deleteManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('bravo_role')).not.toThrow();
    });

    it('should accept any non-empty object type string', () => {
      const schema = deleteManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_device')).not.toThrow();
      expect(() => schema.parse('custom_application')).not.toThrow();
    });

    it('should reject objectId with path traversal', () => {
      const schema = deleteManagedObjectTool.inputSchema.objectId;

      // Test various path traversal patterns
      expect(() => schema.parse('../../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('../../../admin')).toThrow(/path traversal/);
      expect(() => schema.parse('obj/../admin')).toThrow(/path traversal/);
    });

    it('should reject empty objectId', () => {
      const schema = deleteManagedObjectTool.inputSchema.objectId;

      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('   ')).toThrow(/cannot be empty or whitespace/);
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.delete('https://*/openidm/managed/:objectType/:objectId', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid token' }),
            { status: 401 }
          );
        })
      );

      const result = await deleteManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(result.content[0].text).toContain('Failed to delete managed object');
      expect(result.content[0].text).toMatch(/401|[Uu]nauthorized/);
    });

    it('should handle 404 Not Found error', async () => {
      server.use(
        http.delete('https://*/openidm/managed/:objectType/:objectId', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'not_found', message: 'Object does not exist' }),
            { status: 404 }
          );
        })
      );

      const result = await deleteManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'nonexistent',
      });

      expect(result.content[0].text).toContain('Failed to delete managed object');
      expect(result.content[0].text).toMatch(/404|[Nn]ot [Ff]ound/);
    });

    it('should handle 403 Forbidden error', async () => {
      server.use(
        http.delete('https://*/openidm/managed/:objectType/:objectId', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'forbidden', message: 'Insufficient permissions' }),
            { status: 403 }
          );
        })
      );

      const result = await deleteManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
      });

      expect(result.content[0].text).toContain('Failed to delete managed object');
      expect(result.content[0].text).toMatch(/403|[Ff]orbidden/);
    });
  });
});
