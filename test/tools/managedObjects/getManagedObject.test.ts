import { describe, it, expect } from 'vitest';
import { getManagedObjectTool } from '../../../src/tools/managedObjects/getManagedObject.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getManagedObject', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getManagedObject', getManagedObjectTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    const requestCases = [
      {
        name: 'constructs URL with objectType and objectId',
        input: { objectType: 'alpha_user', objectId: 'obj-123' },
        assert: ({ url, scopes }: any) => {
          expect(url).toBe('https://test.forgeblocks.com/openidm/managed/alpha_user/obj-123');
          expect(scopes).toEqual(['fr:idm:*']);
        }
      },
      {
        name: 'passes correct scopes to auth',
        input: { objectType: 'alpha_user', objectId: 'obj-123' },
        assert: ({ scopes }: any) => expect(scopes).toEqual(['fr:idm:*'])
      }
    ];

    it.each(requestCases)('$name', async ({ input, assert }) => {
      await getManagedObjectTool.toolFunction(input as any);

      const [url, scopes] = getSpy().mock.calls.at(-1)!;
      assert({ url, scopes });
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response with full object', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType/:objectId', ({ request, params }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
          }

          return HttpResponse.json({
            _id: params.objectId as string,
            _rev: '1',
            userName: 'test',
            mail: 'test@example.com',
            givenName: 'Test',
            sn: 'User'
          });
        })
      );

      const result = await getManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: 'obj-123'
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

    it('should use safePathSegmentSchema for objectId', () => {
      const schema = getManagedObjectTool.inputSchema.objectId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('ValidObjectId-123')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      {
        name: 'handles 401 Unauthorized error',
        status: 401,
        body: { error: 'unauthorized', message: 'Invalid token' },
        matcher: /401|[Uu]nauthorized/
      },
      {
        name: 'handles 404 Not Found error',
        status: 404,
        body: { error: 'not_found', message: 'Object does not exist' },
        matcher: /404|[Nn]ot [Ff]ound/
      }
    ])('$name', async ({ status, body, matcher }) => {
      server.use(
        http.get('https://*/openidm/managed/:objectType/:objectId', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await getManagedObjectTool.toolFunction({
        objectType: 'alpha_user',
        objectId: status === 404 ? 'nonexistent' : 'obj-123'
      });

      expect(result.content[0].text).toContain('Failed to retrieve managed object');
      expect(result.content[0].text).toMatch(matcher);
    });
  });
});
