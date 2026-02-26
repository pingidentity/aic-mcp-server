import { describe, it, expect } from 'vitest';
import { setDefaultJourneyTool } from '../../../src/tools/am/setDefaultJourney.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('setDefaultJourney', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setDefaultJourney', setDefaultJourneyTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should fetch current auth config first (GET then PUT)', async () => {
      await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Registration',
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[1][2]?.method).toBe('PUT');
    });

    it('should preserve adminAuthModule from current config', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication', () => {
          return HttpResponse.json({ core: { orgConfig: 'Login', adminAuthModule: 'CustomAdmin' } });
        })
      );

      await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Registration',
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.adminAuthModule).toBe('CustomAdmin');
    });

    it('should use Login as default adminAuthModule if missing', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication', () => {
          return HttpResponse.json({ core: { orgConfig: 'Login' } });
        })
      );

      await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Registration',
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.adminAuthModule).toBe('Login');
    });

    it('should set orgConfig to journeyName', async () => {
      await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Registration',
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.orgConfig).toBe('Registration');
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL for realm-config/authentication', async () => {
      await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/alpha/realm-config/authentication');
    });

    it('should use correct headers with protocol=1.0,resource=1.0', async () => {
      await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['Accept-API-Version']).toBe('protocol=1.0,resource=1.0');
    });

    it('should pass correct scopes', async () => {
      await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format success message with realm and journey name', async () => {
      const result = await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Registration',
      });

      expect(result.content[0].text).toContain('alpha');
      expect(result.content[0].text).toContain('Registration');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => setDefaultJourneyTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should validate journeyName with safePathSegmentSchema', () => {
      const schema = setDefaultJourneyTool.inputSchema.journeyName;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('ValidJourney')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 error on GET', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      expect(result.content[0].text).toContain('Failed to set default journey');
    });

    it('should handle 401 error on PUT', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/authentication', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await setDefaultJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Login',
      });

      expect(result.content[0].text).toContain('Failed to set default journey');
    });
  });
});
