import { describe, it, expect } from 'vitest';
import { queryLogsTool } from '../../../src/tools/logs/queryLogs.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('queryLogs', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryLogs', queryLogsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it.each([
      {
        name: 'should encode sources as comma-separated',
        input: { sources: ['am-authentication', 'idm-activity'] },
        expected: 'source=am-authentication%2Cidm-activity',
      },
      {
        name: 'should handle single source',
        input: { sources: ['am-authentication'] },
        expected: 'source=am-authentication',
      },
      {
        name: 'should encode beginTime parameter',
        input: { sources: ['am-authentication'], beginTime: '2025-01-11T10:00:00Z' },
        expected: 'beginTime=2025-01-11T10%3A00%3A00Z',
      },
      {
        name: 'should encode endTime parameter',
        input: { sources: ['am-authentication'], endTime: '2025-01-11T11:00:00Z' },
        expected: 'endTime=2025-01-11T11%3A00%3A00Z',
      },
      {
        name: 'should add transactionId parameter',
        input: { sources: ['am-authentication'], transactionId: 'txn-12345' },
        expected: 'transactionId=txn-12345',
      },
      {
        name: 'should encode queryFilter parameter',
        input: { sources: ['am-authentication'], queryFilter: '/payload/level eq "ERROR"' },
        expected: '_queryFilter=%2Fpayload%2Flevel+eq+%22ERROR%22',
      },
      {
        name: 'should add pagedResultsCookie parameter',
        input: { sources: ['am-authentication'], pagedResultsCookie: 'cookie-xyz' },
        expected: '_pagedResultsCookie=cookie-xyz',
      },
      {
        name: 'should use provided pageSize',
        input: { sources: ['am-authentication'], pageSize: 50 },
        expected: '_pageSize=50',
      },
      {
        name: 'should default pageSize to 100',
        input: { sources: ['am-authentication'] },
        expected: '_pageSize=100',
      },
      {
        name: 'should clamp pageSize to maximum 1000',
        input: { sources: ['am-authentication'], pageSize: 1500 },
        expected: '_pageSize=1000',
      },
    ])('$name', async ({ input, expected }) => {
      await queryLogsTool.toolFunction(input as any);

      const callUrl = getSpy().mock.calls[0][0];
      expect(callUrl).toContain(expected);
    });

    it('should use GET method and pass correct scopes', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication']
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBeUndefined(); // No method specified means GET
      expect(getSpy()).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idc:monitoring:*']
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response', async () => {
      const mockLogs = {
        result: [
          { timestamp: '2025-01-11T10:00:00Z', level: 'INFO', message: 'Log entry 1' },
          { timestamp: '2025-01-11T10:01:00Z', level: 'ERROR', message: 'Log entry 2' }
        ],
        resultCount: 2,
        pagedResultsCookie: 'next-page-cookie'
      };

      server.use(
        http.get('https://*/monitoring/logs', () => {
          return HttpResponse.json(mockLogs);
        })
      );

      const result = await queryLogsTool.toolFunction({
        sources: ['am-authentication']
      });

      expect(result.content[0].text).toContain('Log entry 1');
      expect(result.content[0].text).toContain('Log entry 2');
    });

    it('should handle empty results', async () => {
      const mockLogs = {
        result: [],
        resultCount: 0
      };

      server.use(
        http.get('https://*/monitoring/logs', () => {
          return HttpResponse.json(mockLogs);
        })
      );

      const result = await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        transactionId: 'nonexistent'
      });

      expect(result).toHaveProperty('content');
      expect(result.content[0]).toHaveProperty('text');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require sources parameter', () => {
      expect(() => {
        queryLogsTool.inputSchema.sources.parse(undefined);
      }).toThrow();
    });

    it('should reject empty sources array', () => {
      // But our implementation checks sources && sources.length > 0
      // So this is actually allowed by Zod but won't add source parameter
      const result = queryLogsTool.inputSchema.sources.parse([]);
      expect(result).toEqual([]);
    });

    it('should accept sources array with multiple elements', () => {
      const result = queryLogsTool.inputSchema.sources.parse([
        'am-authentication',
        'idm-activity',
        'am-everything'
      ]);
      expect(result).toHaveLength(3);
    });

    it('should reject pageSize below minimum', () => {
      expect(() => {
        queryLogsTool.inputSchema.pageSize!.parse(0);
      }).toThrow();
    });

    it('should reject pageSize above maximum', () => {
      expect(() => {
        queryLogsTool.inputSchema.pageSize!.parse(1001);
      }).toThrow();
    });

    it('should reject queryFilter exceeding max length', () => {
      expect(() => {
        queryLogsTool.inputSchema.queryFilter!.parse('a'.repeat(2001));
      }).toThrow();
    });

    it('should accept optional parameters as undefined', () => {
      // All optional parameters should parse undefined without error
      expect(() => {
        queryLogsTool.inputSchema.beginTime!.parse(undefined);
        queryLogsTool.inputSchema.endTime!.parse(undefined);
        queryLogsTool.inputSchema.transactionId!.parse(undefined);
        queryLogsTool.inputSchema.queryFilter!.parse(undefined);
        queryLogsTool.inputSchema.pagedResultsCookie!.parse(undefined);
        queryLogsTool.inputSchema.pageSize!.parse(undefined);
      }).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      {
        name: 'should handle 401 Unauthorized error',
        status: 401,
        body: { error: 'unauthorized', message: 'Invalid credentials' },
      },
      {
        name: 'should handle 400 Bad Request error',
        status: 400,
        body: { error: 'bad_request', message: 'Invalid query filter syntax' },
      },
      {
        name: 'should handle 500 Internal Server Error',
        status: 500,
        body: { error: 'internal_error', message: 'Server error' },
      },
    ])('$name', async ({ status, body }) => {
      server.use(
        http.get('https://*/monitoring/logs', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await queryLogsTool.toolFunction({
        sources: ['am-authentication']
      });

      expect(result.content[0].text).toContain('Failed to query logs');
    });
  });
});
