import { describe, it, expect } from 'vitest';
import { queryESVsTool } from '../../../src/tools/esv/queryESVs.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('queryESVs', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryESVs', queryESVsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL for variable type', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('https://test.forgeblocks.com/environment/variables'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should construct URL for secret type', async () => {
      // Add handler for secrets endpoint
      server.use(
        http.get('https://*/environment/secrets', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            result: [],
            resultCount: 0,
            totalPagedResults: 0,
          });
        })
      );

      await queryESVsTool.toolFunction({
        type: 'secret',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('https://test.forgeblocks.com/environment/secrets'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should add queryFilter with queryTerm', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
        queryTerm: 'api-key',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_queryFilter=%2F_id+co+%22api-key%22'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should default queryFilter to "true" when queryTerm omitted', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_queryFilter=true'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should escape double quotes in queryTerm', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
        queryTerm: 'test"injection',
      });

      // The escaped quote should be \\" which URL-encodes to %5C%22
      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_queryFilter=%2F_id+co+%22test%5C%22injection%22'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should add pageSize to URL', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
        pageSize: 25,
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_pageSize=25'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should default pageSize to 50 when omitted', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_pageSize=50'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should clamp pageSize to maximum 100', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
        pageSize: 150,
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_pageSize=100'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should add pagedResultsCookie to URL when provided', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
        pagedResultsCookie: 'cookie-abc',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_pagedResultsCookie=cookie-abc'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should add sortKeys to URL when provided', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
        sortKeys: '_id,-lastChangeDate',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.stringContaining('_sortKeys=_id%2C-lastChangeDate'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should add accept-api-version header', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'resource=2.0'
          })
        })
      );
    });

    it('should pass correct scopes to auth', async () => {
      await queryESVsTool.toolFunction({
        type: 'variable',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idc:esv:read'],
        expect.any(Object)
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response', async () => {
      const result = await queryESVsTool.toolFunction({
        type: 'variable',
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('result');
      expect(Array.isArray(response.result)).toBe(true);
    });

    it('should handle empty results', async () => {
      server.use(
        http.get('https://*/environment/variables', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            result: [],
            resultCount: 0,
            totalPagedResults: 0,
          });
        })
      );

      const result = await queryESVsTool.toolFunction({
        type: 'variable',
        queryTerm: 'nonexistent',
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.result).toEqual([]);
      expect(response.resultCount).toBe(0);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject invalid type enum', () => {
      const schema = queryESVsTool.inputSchema.type;
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('should accept both valid type enum values', () => {
      const schema = queryESVsTool.inputSchema.type;
      expect(() => schema.parse('variable')).not.toThrow();
      expect(() => schema.parse('secret')).not.toThrow();
    });

    it('should reject queryTerm exceeding max length', () => {
      const schema = queryESVsTool.inputSchema.queryTerm;
      expect(() => schema.parse('a'.repeat(101))).toThrow();
    });

    it('should reject sortKeys exceeding max length', () => {
      const schema = queryESVsTool.inputSchema.sortKeys;
      expect(() => schema.parse('a'.repeat(201))).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/environment/variables', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid credentials' }),
            { status: 401 }
          );
        })
      );

      const result = await queryESVsTool.toolFunction({
        type: 'variable',
      });

      expect(result.content[0].text).toContain('Failed to query environment variables');
      expect(result.content[0].text).toContain('401');
    });

    it('should handle 500 Internal Server Error', async () => {
      server.use(
        http.get('https://*/environment/variables', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'internal_error', message: 'Server error' }),
            { status: 500 }
          );
        })
      );

      const result = await queryESVsTool.toolFunction({
        type: 'variable',
      });

      expect(result.content[0].text).toContain('Failed to query environment variables');
      expect(result.content[0].text).toContain('500');
    });
  });
});
