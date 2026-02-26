import { describe, it, expect } from 'vitest';
import { deleteJourneyTool } from '../../../src/tools/am/deleteJourney.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteJourney', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteJourney', deleteJourneyTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with encoded journeyName', async () => {
      await deleteJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      const [url, scopes] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/alpha/realm-config/authentication/authenticationtrees/trees/Login');
      expect(scopes).toEqual(['fr:am:*']);
    });

    it('should use DELETE method', async () => {
      await deleteJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('DELETE');
    });

    it('should include AM_API_HEADERS', async () => {
      await deleteJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should URL-encode journeyName with special characters', async () => {
      await deleteJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Copy of Login',
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('Copy%20of%20Login');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format success message mentioning node cleanup', async () => {
      const result = await deleteJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      expect(result.content[0].text).toContain('Login');
      expect(result.content[0].text).toContain('deleted successfully');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => deleteJourneyTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should validate journeyName with safePathSegmentSchema', () => {
      const schema = deleteJourneyTool.inputSchema.journeyName;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('ValidJourney')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should categorize errors and include category in message', async () => {
      server.use(
        http.delete('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await deleteJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'NonexistentJourney',
      });

      expect(result.content[0].text).toContain('[not_found]');
      expect(result.content[0].text).toContain('Failed to delete journey');
    });
  });
});
