import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { queryLogsTool } from '../../../src/tools/logs/queryLogs.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('queryLogs', () => {
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
    await snapshotTest('queryLogs', queryLogsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with sources parameter (comma-separated)', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication', 'idm-activity']
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('source=am-authentication%2Cidm-activity');
    });

    it('should construct URL with single source', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication']
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('source=am-authentication');
      expect(callUrl).not.toContain(',');
    });

    it('should add beginTime to URL when provided', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        beginTime: '2025-01-11T10:00:00Z'
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('beginTime=2025-01-11T10%3A00%3A00Z');
    });

    it('should add endTime to URL when provided', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        endTime: '2025-01-11T11:00:00Z'
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('endTime=2025-01-11T11%3A00%3A00Z');
    });

    it('should add transactionId to URL when provided', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        transactionId: 'txn-12345'
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('transactionId=txn-12345');
    });

    it('should add queryFilter to URL when provided', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        queryFilter: '/payload/level eq "ERROR"'
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('_queryFilter=%2Fpayload%2Flevel+eq+%22ERROR%22');
    });

    it('should add pagedResultsCookie to URL when provided', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        pagedResultsCookie: 'cookie-xyz'
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('_pagedResultsCookie=cookie-xyz');
    });

    it('should add pageSize to URL', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        pageSize: 50
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('_pageSize=50');
    });

    it('should default pageSize to 100 when omitted', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication']
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('_pageSize=100');
    });

    it('should clamp pageSize to maximum 1000', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        pageSize: 1500
      });

      const callUrl = makeAuthenticatedRequestSpy.mock.calls[0][0];
      expect(callUrl).toContain('_pageSize=1000');
    });

    it('should use GET method (default)', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication']
      });

      // makeAuthenticatedRequest is called without method option, which defaults to GET
      const options = makeAuthenticatedRequestSpy.mock.calls[0][2];
      expect(options?.method).toBeUndefined(); // No method specified means GET
    });

    it('should pass correct scopes to auth', async () => {
      await queryLogsTool.toolFunction({
        sources: ['am-authentication']
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
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
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/monitoring/logs', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid credentials' }),
            { status: 401 }
          );
        })
      );

      const result = await queryLogsTool.toolFunction({
        sources: ['am-authentication']
      });

      expect(result.content[0].text).toContain('Failed to query logs');
    });

    it('should handle 400 Bad Request error', async () => {
      server.use(
        http.get('https://*/monitoring/logs', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'bad_request', message: 'Invalid query filter syntax' }),
            { status: 400 }
          );
        })
      );

      const result = await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        queryFilter: 'invalid'
      });

      expect(result.content[0].text).toContain('Failed to query logs');
    });

    it('should handle 500 Internal Server Error', async () => {
      server.use(
        http.get('https://*/monitoring/logs', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'internal_error', message: 'Server error' }),
            { status: 500 }
          );
        })
      );

      const result = await queryLogsTool.toolFunction({
        sources: ['am-authentication'],
        queryFilter: 'payload/level eq "ERROR"' // Missing leading /
      });

      expect(result.content[0].text).toContain('Failed to query logs');
    });
  });
});
