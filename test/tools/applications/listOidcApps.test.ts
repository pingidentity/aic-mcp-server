import { describe, it, expect } from 'vitest';
import { listOidcAppsTool } from '../../../src/tools/applications/listOidcApps.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listOidcApps', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listOidcApps', listOidcAppsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should default queryFilter to true', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      await listOidcAppsTool.toolFunction({ realm: 'alpha' });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain('_queryFilter=true');
    });

    it('should use provided queryFilter', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      await listOidcAppsTool.toolFunction({ realm: 'alpha', queryFilter: 'name sw "test"' });

      const [url] = getSpy().mock.calls[0];
      expect(url).toContain(encodeURIComponent('name sw "test"'));
    });

    it('should pass correct scopes', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return HttpResponse.json({ result: [] });
        })
      );

      await listOidcAppsTool.toolFunction({ realm: 'alpha' });

      const [, scopes] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:idm:*']);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept valid realm values', () => {
      const schema = listOidcAppsTool.inputSchema.realm;
      expect(() => schema.parse('alpha')).not.toThrow();
      expect(() => schema.parse('bravo')).not.toThrow();
    });

    it('should make queryFilter optional', () => {
      const schema = listOidcAppsTool.inputSchema.queryFilter;
      expect(schema.isOptional()).toBe(true);
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      server.use(
        http.get('https://*/openidm/managed/alpha_application', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await listOidcAppsTool.toolFunction({ realm: 'alpha' });
      expect(result.content[0].text).toContain('Failed to list OIDC apps');
    });
  });
});
