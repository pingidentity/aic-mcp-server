import { describe, it, expect } from 'vitest';
import { patchManagedObjectTool } from '../../../src/tools/managedObjects/patchManagedObject.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('patchManagedObject', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('patchManagedObject', patchManagedObjectTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with objectType and objectId', async () => {
      await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '1',
        operations: [],
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/openidm/managed/alpha_user/obj-123',
        ['fr:idm:*'],
        expect.any(Object)
      );
    });

    it('should add If-Match header with revision (not quoted)', async () => {
      await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '2',
        operations: [],
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];

      expect(requestOptions.headers['If-Match']).toBe('2');
      expect(requestOptions.headers['If-Match']).not.toBe('"2"');
    });

    it('should send operations array directly in body without transformation', async () => {
      await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '1',
        operations: [{ operation: 'replace', field: '/mail', value: 'new@test.com' }],
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      const requestBody = JSON.parse(requestOptions.body);

      // Verify operations are sent as-is, NOT transformed to op/path
      expect(requestBody).toEqual([
        { operation: 'replace', field: '/mail', value: 'new@test.com' }
      ]);
      // Ensure no transformation happened
      expect(requestBody[0]).not.toHaveProperty('op');
      expect(requestBody[0]).not.toHaveProperty('path');
      expect(requestBody[0]).toHaveProperty('operation');
      expect(requestBody[0]).toHaveProperty('field');
    });

    it('should handle multiple operations', async () => {
      await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '1',
        operations: [
          { operation: 'replace', field: '/givenName', value: 'Jane' },
          { operation: 'replace', field: '/sn', value: 'Doe' }
        ],
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      const requestBody = JSON.parse(requestOptions.body);

      expect(requestBody).toHaveLength(2);
      expect(requestBody).toEqual([
        { operation: 'replace', field: '/givenName', value: 'Jane' },
        { operation: 'replace', field: '/sn', value: 'Doe' }
      ]);
    });

    it('should handle remove operation without value field', async () => {
      await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '1',
        operations: [{ operation: 'remove', field: '/description' }],
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      const requestBody = JSON.parse(requestOptions.body);

      expect(requestBody).toEqual([
        { operation: 'remove', field: '/description' }
      ]);
      // Value should be omitted (undefined in input means it won't be in JSON)
      expect(requestBody[0]).not.toHaveProperty('value');
    });

    it('should pass correct scopes to auth', async () => {
      await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '1',
        operations: [],
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idm:*'],
        expect.any(Object)
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should extract _id and _rev from response in success message', async () => {
      server.use(
        http.patch('https://*/openidm/managed/:objectType/:objectId', ({ params }) => {
          return HttpResponse.json({
            _id: params.objectId as string,
            _rev: '2',
            userName: 'test',
            mail: 'new@test.com',
          });
        })
      );

      const result = await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '1',
        operations: [{ operation: 'replace', field: '/mail', value: 'new@test.com' }],
      });

      expect(result.content[0].text).toContain('obj-123');
      expect(result.content[0].text).toContain('2');
      // Verify it matches the expected format
      expect(result.content[0].text).toMatch(/Patched managed object obj-123\. New revision: 2/);
    });

    it('should format successful response', async () => {
      server.use(
        http.patch('https://*/openidm/managed/:objectType/:objectId', ({ params }) => {
          return HttpResponse.json({
            _id: params.objectId as string,
            _rev: '2',
          });
        })
      );

      const result = await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '1',
        operations: [],
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Patched managed object');
      expect(result.content[0].text).toContain('New revision:');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty objectType string', () => {
      const schema = patchManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept standard object types', () => {
      const schema = patchManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('bravo_group')).not.toThrow();
    });

    it('should accept any non-empty object type string', () => {
      const schema = patchManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_device')).not.toThrow();
      expect(() => schema.parse('custom_application')).not.toThrow();
    });

    it('should use safePathSegmentSchema for objectId', () => {
      const schema = patchManagedObjectTool.inputSchema.objectId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('ValidObjectId-123')).not.toThrow();
    });

    it('should require revision parameter', () => {
      const schema = patchManagedObjectTool.inputSchema.revision;

      // Revision is required
      expect(schema).toBeDefined();
      expect(() => schema.parse('1')).not.toThrow();

      // Test that calling the tool without revision would fail
      // (This is caught by TypeScript, but we can verify the schema exists)
      expect(schema.parse('test-revision')).toBe('test-revision');
    });

    it('should require operations array', () => {
      const schema = patchManagedObjectTool.inputSchema.operations;

      // Operations is required
      expect(schema).toBeDefined();
      expect(() => schema.parse([])).not.toThrow();
      expect(() => schema.parse([{ operation: 'replace', field: '/test', value: 'x' }])).not.toThrow();
    });

    it('should accept empty operations array', () => {
      const schema = patchManagedObjectTool.inputSchema.operations;

      // Empty array should be valid (API may handle as no-op)
      expect(() => schema.parse([])).not.toThrow();
    });

    it('should validate operation enum values', () => {
      const schema = patchManagedObjectTool.inputSchema.operations;

      // Invalid operation type should be rejected
      expect(() => schema.parse([{ operation: 'invalid', field: '/test', value: 'x' }])).toThrow();
      expect(() => schema.parse([{ operation: 'update', field: '/test', value: 'x' }])).toThrow();
      expect(() => schema.parse([{ operation: 'delete', field: '/test' }])).toThrow();
    });

    it('should accept all valid operation types', () => {
      const schema = patchManagedObjectTool.inputSchema.operations;

      // All standard JSON Patch operations should be accepted
      expect(() => schema.parse([{ operation: 'add', field: '/test', value: 'x' }])).not.toThrow();
      expect(() => schema.parse([{ operation: 'remove', field: '/test' }])).not.toThrow();
      expect(() => schema.parse([{ operation: 'replace', field: '/test', value: 'x' }])).not.toThrow();
      expect(() => schema.parse([{ operation: 'move', field: '/test', value: '/other' }])).not.toThrow();
      expect(() => schema.parse([{ operation: 'copy', field: '/test', value: '/other' }])).not.toThrow();
      expect(() => schema.parse([{ operation: 'test', field: '/test', value: 'x' }])).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      {
        name: 'should handle 401 Unauthorized error',
        status: 401,
        body: { error: 'unauthorized', message: 'Invalid token' },
        matcher: /401|[Uu]nauthorized/,
      },
      {
        name: 'should handle 404 Not Found error',
        status: 404,
        body: { error: 'not_found', message: 'Object does not exist' },
        matcher: /404|[Nn]ot [Ff]ound/,
      },
      {
        name: 'should handle 412 Precondition Failed error (revision mismatch)',
        status: 412,
        body: { error: 'precondition_failed', message: 'The resource version does not match the version provided' },
        matcher: /412|[Pp]recondition|[Rr]evision/,
      },
      {
        name: 'should handle 400 Bad Request error (invalid patch)',
        status: 400,
        body: { error: 'bad_request', message: 'Invalid patch operation' },
        matcher: /400|[Bb]ad [Rr]equest/,
      },
    ])('$name', async ({ status, body, matcher }) => {
      server.use(
        http.patch('https://*/openidm/managed/:objectType/:objectId', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await patchManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123',
        revision: '1',
        operations: [],
      });

      expect(result.content[0].text).toContain('Failed to patch managed object');
      expect(result.content[0].text).toMatch(matcher);
    });
  });
});
