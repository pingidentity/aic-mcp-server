import { describe, it, expect } from 'vitest';
import { queryManagedObjectsTool } from '../../../src/tools/managedObjects/queryManagedObjects.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('queryManagedObjects', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryManagedObjects', queryManagedObjectsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it.each([
      {
        name: 'should include objectType in URL path',
        input: { objectType: 'alpha_user' },
        expected: '/openidm/managed/alpha_user'
      },
      {
        name: 'should encode queryFilter parameter',
        input: { objectType: 'alpha_user', queryFilter: 'userName sw "test"' },
        expected: '_queryFilter=userName+sw+%22test%22'
      },
      {
        name: 'should default queryFilter to "true"',
        input: { objectType: 'alpha_user' },
        expected: '_queryFilter=true'
      },
      {
        name: 'should use provided pageSize',
        input: { objectType: 'alpha_user', pageSize: 10 },
        expected: '_pageSize=10'
      },
      {
        name: 'should default pageSize to 50',
        input: { objectType: 'alpha_user' },
        expected: '_pageSize=50'
      },
      {
        name: 'should clamp pageSize to maximum 250',
        input: { objectType: 'alpha_user', pageSize: 500 },
        expected: '_pageSize=250'
      },
      {
        name: 'should include pagedResultsCookie',
        input: { objectType: 'alpha_user', pagedResultsCookie: 'cookie123' },
        expected: '_pagedResultsCookie=cookie123'
      },
      {
        name: 'should encode sortKeys',
        input: { objectType: 'alpha_user', sortKeys: 'userName,-givenName' },
        expected: '_sortKeys=userName%2C-givenName'
      },
      {
        name: 'should encode fields',
        input: { objectType: 'alpha_user', fields: 'userName,mail' },
        expected: '_fields=userName%2Cmail'
      },
      {
        name: 'should always include totalPagedResultsPolicy',
        input: { objectType: 'alpha_user' },
        expected: '_totalPagedResultsPolicy=EXACT'
      }
    ])('$name', async ({ input, expected }) => {
      await queryManagedObjectsTool.toolFunction(input as any);

      expect(getSpy()).toHaveBeenCalledWith(expect.stringContaining(expected), expect.any(Array));
    });

    it('should pass correct scopes to auth', async () => {
      await queryManagedObjectsTool.toolFunction({ objectType: 'alpha_user' });

      expect(getSpy()).toHaveBeenCalledWith(expect.any(String), ['fr:idm:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response', async () => {
      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user'
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('result');
      expect(Array.isArray(response.result)).toBe(true);
    });

    it('should handle empty result array', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType', () => {
          return HttpResponse.json({
            result: [],
            resultCount: 0,
            totalPagedResults: 0,
            pagedResultsCookie: null
          });
        })
      );

      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        queryFilter: 'userName eq "none"'
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.result).toEqual([]);
      expect(response.resultCount).toBe(0);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty objectType string', () => {
      const schema = queryManagedObjectsTool.inputSchema.objectType;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept standard object types', () => {
      const schema = queryManagedObjectsTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('bravo_role')).not.toThrow();
    });

    it('should accept any non-empty object type string', () => {
      const schema = queryManagedObjectsTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_device')).not.toThrow();
      expect(() => schema.parse('custom_application')).not.toThrow();
    });

    it('should work with any object type in tool function', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_device'
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('/openidm/managed/alpha_device'),
        expect.any(Array)
      );
    });

    it('should reject queryFilter exceeding max length', () => {
      const schema = queryManagedObjectsTool.inputSchema.queryFilter;
      expect(() => schema.parse('a'.repeat(1001))).toThrow();
    });

    it('should reject pageSize below minimum', () => {
      const schema = queryManagedObjectsTool.inputSchema.pageSize;
      expect(() => schema.parse(0)).toThrow();
    });

    it('should reject pageSize above maximum', () => {
      const schema = queryManagedObjectsTool.inputSchema.pageSize;
      expect(() => schema.parse(251)).toThrow();
    });

    it('should reject sortKeys exceeding max length', () => {
      const schema = queryManagedObjectsTool.inputSchema.sortKeys;
      expect(() => schema.parse('a'.repeat(501))).toThrow();
    });

    it('should reject fields exceeding max length', () => {
      const schema = queryManagedObjectsTool.inputSchema.fields;
      expect(() => schema.parse('a'.repeat(501))).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      {
        name: 'should handle 401 Unauthorized error',
        status: 401,
        body: { error: 'unauthorized', message: 'Invalid credentials' },
        matcher: /401/
      },
      {
        name: 'should handle 400 Bad Request error',
        status: 400,
        body: { error: 'bad_request', message: 'Invalid query filter syntax' },
        matcher: /Invalid query filter syntax/
      },
      {
        name: 'should handle 500 Internal Server Error',
        status: 500,
        body: { error: 'internal_error' },
        matcher: /alpha_user/
      }
    ])('$name', async ({ status, body, matcher }) => {
      server.use(
        http.get('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user'
      });

      expect(result.content[0].text).toMatch(matcher);
    });

    it('should handle network/fetch error', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType', () => {
          return HttpResponse.error();
        })
      );

      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user'
      });

      expect(result.content[0].text).toMatch(/Failed to query alpha_user/i);
    });
  });
});
