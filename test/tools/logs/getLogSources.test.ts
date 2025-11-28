import { describe, it, expect } from 'vitest';
import { getLogSourcesTool } from '../../../src/tools/logs/getLogSources.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getLogSources', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getLogSources', getLogSourcesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL and scopes', async () => {
      await getLogSourcesTool.toolFunction();

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/monitoring/logs/sources',
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
    it.each([
      {
        name: 'should handle 401 Unauthorized error',
        status: 401,
        body: { error: 'unauthorized', message: 'Invalid credentials' },
      },
      {
        name: 'should handle 500 Internal Server Error',
        status: 500,
        body: { error: 'internal_error', message: 'Server error' },
      },
    ])('$name', async ({ status, body }) => {
      server.use(
        http.get('https://*/monitoring/logs/sources', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await getLogSourcesTool.toolFunction();

      expect(result.content[0].text).toContain('Failed to fetch log sources');
    });
  });
});
