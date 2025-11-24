import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getLogSourcesTool } from '../../../src/tools/logs/getLogSources.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('getLogSources', () => {
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
    await snapshotTest('getLogSources', getLogSourcesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct correct URL', async () => {
      await getLogSourcesTool.toolFunction();

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/monitoring/logs/sources',
        expect.any(Array)
      );
    });

    it('should pass correct scopes to auth', async () => {
      await getLogSourcesTool.toolFunction();

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idc:monitoring:*']
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response with source list', async () => {
      const mockSources = ['am-authentication', 'am-everything', 'idm-everything', 'idm-activity'];

      server.use(
        http.get('https://*/monitoring/logs/sources', () => {
          return HttpResponse.json(mockSources);
        })
      );

      const result = await getLogSourcesTool.toolFunction();

      expect(result.content[0].text).toContain('am-authentication');
      expect(result.content[0].text).toContain('am-everything');
      expect(result.content[0].text).toContain('idm-everything');
      expect(result.content[0].text).toContain('idm-activity');
    });

    it('should handle empty source list', async () => {
      server.use(
        http.get('https://*/monitoring/logs/sources', () => {
          return HttpResponse.json([]);
        })
      );

      const result = await getLogSourcesTool.toolFunction();

      expect(result).toHaveProperty('content');
      expect(result.content[0]).toHaveProperty('text');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/monitoring/logs/sources', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid credentials' }),
            { status: 401 }
          );
        })
      );

      const result = await getLogSourcesTool.toolFunction();

      expect(result.content[0].text).toContain('Failed to fetch log sources');
    });

    it('should handle 500 Internal Server Error', async () => {
      server.use(
        http.get('https://*/monitoring/logs/sources', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'internal_error', message: 'Server error' }),
            { status: 500 }
          );
        })
      );

      const result = await getLogSourcesTool.toolFunction();

      expect(result.content[0].text).toContain('Failed to fetch log sources');
    });
  });
});
