import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createManagedObjectTool } from '../../../src/tools/managedObjects/createManagedObject.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('createManagedObject', () => {
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
    await snapshotTest('createManagedObject', createManagedObjectTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with objectType and action', async () => {
      await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: { userName: 'test' },
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/openidm/managed/alpha_user?_action=create',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should send objectData in request body', async () => {
      await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: { userName: 'test', mail: 'test@example.com' },
      });

      const callArgs = makeAuthenticatedRequestSpy.mock.calls[0];
      const requestOptions = callArgs[2];
      const requestBody = JSON.parse(requestOptions.body);

      expect(requestBody).toEqual({
        userName: 'test',
        mail: 'test@example.com',
      });
    });

    it('should pass correct scopes to auth', async () => {
      await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: { userName: 'test' },
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
    it('should return only _id from response', async () => {
      server.use(
        http.post('https://*/openidm/managed/:objectType', async ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }

          return HttpResponse.json({
            _id: 'new-id-123',
            _rev: '1',
            userName: 'test',
            mail: 'test@example.com',
            givenName: 'Test',
            sn: 'User',
          });
        })
      );

      const result = await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: { userName: 'test' },
      });

      expect(result.content[0].text).toContain('new-id-123');
      expect(result.content[0].text).not.toContain('givenName');
      expect(result.content[0].text).not.toContain('sn');
    });

    it('should format successful response', async () => {
      const result = await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: { userName: 'test' },
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Created managed object');
      expect(result.content[0].text).toContain('new-id');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject invalid objectType enum', () => {
      const schema = createManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('invalid_type')).toThrow();
    });

    it('should accept all valid objectType enum values', async () => {
      const schema = createManagedObjectTool.inputSchema.objectType;

      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('bravo_role')).not.toThrow();
      expect(() => schema.parse('alpha_group')).not.toThrow();
      expect(() => schema.parse('bravo_organization')).not.toThrow();
    });

    it('should accept objectData as any object', () => {
      const schema = createManagedObjectTool.inputSchema.objectData;

      // API validates required fields, not our code
      expect(() => schema.parse({ arbitrary: 'field' })).not.toThrow();
      expect(() => schema.parse({ userName: 'test', mail: 'test@example.com' })).not.toThrow();
      expect(() => schema.parse({})).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.post('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid token' }),
            { status: 401 }
          );
        })
      );

      const result = await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: { userName: 'test' },
      });

      expect(result.content[0].text).toContain('Failed to create managed object');
      expect(result.content[0].text).toMatch(/401|[Uu]nauthorized/);
    });

    it('should handle 400 Bad Request error', async () => {
      server.use(
        http.post('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(
            JSON.stringify({
              error: 'bad_request',
              message: 'Missing required field: userName'
            }),
            { status: 400 }
          );
        })
      );

      const result = await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: {}, // Missing required userName
      });

      expect(result.content[0].text).toContain('Failed to create managed object');
      expect(result.content[0].text).toMatch(/400|[Bb]ad [Rr]equest|Missing required field/);
    });

    it('should handle 409 Conflict error', async () => {
      server.use(
        http.post('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(
            JSON.stringify({
              error: 'conflict',
              message: 'Object with userName "existing" already exists'
            }),
            { status: 409 }
          );
        })
      );

      const result = await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: { userName: 'existing' },
      });

      expect(result.content[0].text).toContain('Failed to create managed object');
      expect(result.content[0].text).toMatch(/409|[Cc]onflict/);
    });
  });
});
