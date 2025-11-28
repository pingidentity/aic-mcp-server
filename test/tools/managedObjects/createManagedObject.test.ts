import { describe, it, expect } from 'vitest';
import { createManagedObjectTool } from '../../../src/tools/managedObjects/createManagedObject.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('createManagedObject', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createManagedObject', createManagedObjectTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    const requestCases = [
      {
        name: 'constructs URL with objectType and action',
        input: { objectType: 'alpha_user', objectData: { userName: 'test' } },
        assert: ({ url }: any) =>
          expect(url).toBe('https://test.forgeblocks.com/openidm/managed/alpha_user?_action=create'),
      },
      {
        name: 'sends objectData in request body',
        input: { objectType: 'alpha_user', objectData: { userName: 'test', mail: 'test@example.com' } },
        assert: ({ options }: any) => {
          const requestBody = JSON.parse(options.body);
          expect(requestBody).toEqual({ userName: 'test', mail: 'test@example.com' });
        },
      },
      {
        name: 'passes correct scopes to auth',
        input: { objectType: 'alpha_user', objectData: { userName: 'test' } },
        assert: ({ scopes }: any) => expect(scopes).toEqual(['fr:idm:*']),
      },
    ];

    it.each(requestCases)('$name', async ({ input, assert }) => {
      await createManagedObjectTool.toolFunction(input as any);

      const [url, scopes, options] = getSpy().mock.calls.at(-1)!;
      assert({ url, scopes, options });
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
    it('should reject empty objectType string', () => {
      const schema = createManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept standard object types', () => {
      const schema = createManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('bravo_role')).not.toThrow();
    });

    it('should accept any non-empty object type string', () => {
      const schema = createManagedObjectTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_device')).not.toThrow();
      expect(() => schema.parse('custom_application')).not.toThrow();
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
    it.each([
      {
        name: 'handles 401 Unauthorized error',
        status: 401,
        body: { error: 'unauthorized', message: 'Invalid token' },
        matcher: /401|[Uu]nauthorized/,
      },
      {
        name: 'handles 400 Bad Request error',
        status: 400,
        body: { error: 'bad_request', message: 'Missing required field: userName' },
        matcher: /400|[Bb]ad [Rr]equest|Missing required field/,
      },
      {
        name: 'handles 409 Conflict error',
        status: 409,
        body: { error: 'conflict', message: 'Object with userName "existing" already exists' },
        matcher: /409|[Cc]onflict/,
      },
    ])('$name', async ({ status, body, matcher }) => {
      server.use(
        http.post('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await createManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectData: { userName: 'test' },
      });

      expect(result.content[0].text).toContain('Failed to create managed object');
      expect(result.content[0].text).toMatch(matcher);
    });
  });
});
