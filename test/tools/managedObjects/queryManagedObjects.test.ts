import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { queryManagedObjectsTool } from '../../../src/tools/managedObjects/queryManagedObjects.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('queryManagedObjects', () => {
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
    await snapshotTest('queryManagedObjects', queryManagedObjectsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with objectType in path', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('/openidm/managed/alpha_user'),
        expect.any(Array)
      );
    });

    it('should construct URL with queryFilter parameter', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        queryFilter: 'userName sw "test"',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_queryFilter=userName+sw+%22test%22'),
        expect.any(Array)
      );
    });

    it('should default queryFilter to "true" when omitted', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_queryFilter=true'),
        expect.any(Array)
      );
    });

    it('should construct URL with pageSize parameter', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        pageSize: 10,
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_pageSize=10'),
        expect.any(Array)
      );
    });

    it('should default pageSize to 50 when omitted', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_pageSize=50'),
        expect.any(Array)
      );
    });

    it('should clamp pageSize to maximum 250', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        pageSize: 500,
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_pageSize=250'),
        expect.any(Array)
      );
    });

    it('should construct URL with pagedResultsCookie', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        pagedResultsCookie: 'cookie123',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_pagedResultsCookie=cookie123'),
        expect.any(Array)
      );
    });

    it('should construct URL with sortKeys', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        sortKeys: 'userName,-givenName',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_sortKeys=userName%2C-givenName'),
        expect.any(Array)
      );
    });

    it('should construct URL with fields', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        fields: 'userName,mail',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_fields=userName%2Cmail'),
        expect.any(Array)
      );
    });

    it('should always add totalPagedResultsPolicy', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('_totalPagedResultsPolicy=EXACT'),
        expect.any(Array)
      );
    });

    it('should pass correct scopes to auth', async () => {
      await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idm:*'],
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response', async () => {
      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
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
            pagedResultsCookie: null,
          });
        })
      );

      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        queryFilter: 'userName eq "none"',
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
        objectType: 'alpha_device',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
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
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid credentials' }),
            { status: 401 }
          );
        })
      );

      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(result.content[0].text).toContain('401');
    });

    it('should handle 400 Bad Request error', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'bad_request', message: 'Invalid query filter syntax' }),
            { status: 400 }
          );
        })
      );

      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
        queryFilter: 'invalid syntax',
      });

      expect(result.content[0].text).toContain('Invalid query filter syntax');
    });

    it('should handle network/fetch error', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType', () => {
          return HttpResponse.error();
        })
      );

      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(result.content[0].text).toMatch(/Failed to query alpha_user/i);
    });

    it('should include objectType in error message for context', async () => {
      server.use(
        http.get('https://*/openidm/managed/:objectType', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'internal_error' }),
            { status: 500 }
          );
        })
      );

      const result = await queryManagedObjectsTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(result.content[0].text).toContain('alpha_user');
    });
  });
});
