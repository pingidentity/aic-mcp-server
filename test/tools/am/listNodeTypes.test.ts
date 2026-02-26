import { describe, it, expect } from 'vitest';
import { listNodeTypesTool } from '../../../src/tools/am/listNodeTypes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listNodeTypes', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listNodeTypes', listNodeTypesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with ?_action=getAllTypes', async () => {
      await listNodeTypesTool.toolFunction({ realm: 'alpha' });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/alpha/realm-config/authentication/authenticationtrees/nodes');
      expect(url).toContain('_action=getAllTypes');
    });

    it('should use POST method', async () => {
      await listNodeTypesTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('POST');
    });

    it('should include AM_API_HEADERS', async () => {
      await listNodeTypesTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should pass correct scopes', async () => {
      await listNodeTypesTool.toolFunction({ realm: 'alpha' });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });

    it('should send empty JSON body', async () => {
      await listNodeTypesTool.toolFunction({ realm: 'alpha' });

      const options = getSpy().mock.calls[0][2];
      expect(options?.body).toBe(JSON.stringify({}));
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should extract result array from response', async () => {
      server.use(
        http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes', () => {
          return HttpResponse.json({
            result: [
              { _id: 'UsernameCollectorNode', name: 'Username Collector' },
              { _id: 'PasswordCollectorNode', name: 'Password Collector' }
            ]
          });
        })
      );

      const result = await listNodeTypesTool.toolFunction({ realm: 'alpha' });
      const text = result.content[0].text;

      expect(text).toContain('UsernameCollectorNode');
      expect(text).toContain('PasswordCollectorNode');
    });

    it('should include count in formatted response', async () => {
      server.use(
        http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes', () => {
          return HttpResponse.json({
            result: [{ _id: 'TypeA' }]
          });
        })
      );

      const result = await listNodeTypesTool.toolFunction({ realm: 'alpha' });
      const parsed = JSON.parse(result.content[0].text.split('\n\nTransaction ID:')[0]);

      expect(parsed.count).toBe(1);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => listNodeTypesTool.inputSchema.realm.parse(undefined)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 error', async () => {
      server.use(
        http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await listNodeTypesTool.toolFunction({ realm: 'alpha' });

      expect(result.content[0].text).toContain('Failed to list node types');
    });
  });
});
