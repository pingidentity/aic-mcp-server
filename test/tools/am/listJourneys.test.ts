import { describe, it, expect } from 'vitest';
import { listJourneysTool } from '../../../src/tools/am/listJourneys.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listJourneys', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listJourneys', listJourneysTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with realm and query parameters', async () => {
      await listJourneysTool.toolFunction({ realm: 'alpha' });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/alpha/realm-config/authentication/authenticationtrees/trees');
      expect(url).toContain('_queryFilter=true');
      expect(url).toContain('_pageSize=-1');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should include expected fields in request', async () => {
      await listJourneysTool.toolFunction({ realm: 'bravo' });

      const url = getSpy().mock.calls[0][0];
      // Fields are URL-encoded (commas become %2C)
      expect(url).toContain('_fields=');
      expect(url).toContain('_id');
      expect(url).toContain('description');
      expect(url).toContain('enabled');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return journey list', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees', () => {
          return HttpResponse.json({
            result: [
              { _id: 'Login', description: 'Default login journey', enabled: true },
              { _id: 'Registration', description: 'User registration', enabled: true },
            ],
            resultCount: 2,
          });
        })
      );

      const result = await listJourneysTool.toolFunction({ realm: 'alpha' });
      const text = result.content[0].text;

      expect(text).toContain('Login');
      expect(text).toContain('Registration');
    });

    it('should handle empty results', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees', () => {
          return HttpResponse.json({ result: [], resultCount: 0 });
        })
      );

      const result = await listJourneysTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('result');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => listJourneysTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should accept valid realm values', () => {
      expect(listJourneysTool.inputSchema.realm.parse('alpha')).toBe('alpha');
      expect(listJourneysTool.inputSchema.realm.parse('bravo')).toBe('bravo');
    });

    it('should reject invalid realm values', () => {
      expect(() => listJourneysTool.inputSchema.realm.parse('invalid')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized' },
      { status: 404, desc: '404 Not Found' },
    ])('should handle $desc', async ({ status }) => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await listJourneysTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to list journeys');
    });
  });
});
