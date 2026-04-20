import { describe, it, expect } from 'vitest';
import { installIdmFeatureTool } from '../../../src/tools/featureManagement/installIdmFeature.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('installIdmFeature', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('installIdmFeature', installIdmFeatureTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    const setupInstallEndpoint = () =>
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return HttpResponse.json({
            status: 200,
            message: 'Install complete.'
          });
        })
      );

    it('POSTs /openidm/feature/<featureName>?_action=install with IDM scopes and an empty JSON body', async () => {
      setupInstallEndpoint();

      await installIdmFeatureTool.toolFunction({ featureName: 'groups' });

      const [url, scopes, options] = getSpy().mock.calls.at(-1)!;
      expect(url).toBe('https://test.forgeblocks.com/openidm/feature/groups?_action=install');
      expect(scopes).toEqual(['fr:idm:*']);
      expect(options).toBeDefined();
      expect(options!.method).toBe('POST');
      // Empty-object body ensures makeAuthenticatedRequest sets Content-Type: application/json.
      expect(options!.body).toBe('{}');
    });

    it('hardcodes ?_action=install (never taken from user input)', async () => {
      setupInstallEndpoint();

      await installIdmFeatureTool.toolFunction({ featureName: 'aiagent' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('?_action=install');
      expect(url.endsWith('?_action=install')).toBe(true);
    });

    it('preserves `/` as a separator for slash-containing feature names (per-segment encoding)', async () => {
      setupInstallEndpoint();

      await installIdmFeatureTool.toolFunction({ featureName: 'password/timestamps' });

      const [url] = getSpy().mock.calls.at(-1)!;
      // The `/` must be preserved literally — NOT encoded as %2F — so the IDM
      // router parses the remainder of the path as the feature id.
      expect(url).toBe('https://test.forgeblocks.com/openidm/feature/password/timestamps?_action=install');
    });

    it('sets Content-Type: application/json via the empty JSON body (verified by body presence)', async () => {
      // The Content-Type header is added by makeAuthenticatedRequest when `options.body`
      // is truthy (see src/utils/apiHelpers.ts). We assert at the call boundary that
      // body is a non-empty string so the helper will add the header.
      setupInstallEndpoint();

      await installIdmFeatureTool.toolFunction({ featureName: 'groups' });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      expect(options!.body).toBeTruthy();
      expect(typeof options!.body).toBe('string');
      // Parsing must succeed and the body must represent an empty object.
      expect(JSON.parse(options!.body as string)).toEqual({});
    });

    it('declares the same scopes on the tool object', () => {
      expect(installIdmFeatureTool.scopes).toEqual(['fr:idm:*']);
    });

    it('declares destructive + non-idempotent annotations', () => {
      // Locked decision #4: install is one-way and cannot be undone from this tool,
      // so the strongest destructive signal is set; second install will fail
      // pre-validate, so idempotentHint is explicitly false.
      expect(installIdmFeatureTool.annotations).toEqual({
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      });
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('wraps the upstream 200 body with one-way messaging, _id, and apiResponse passthrough', async () => {
      const upstream = { status: 200, message: 'Install complete.' };

      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return HttpResponse.json(upstream, {
            headers: { 'x-forgerock-transactionid': 'tx-install-idm-feature-1' }
          });
        })
      );

      const result = await installIdmFeatureTool.toolFunction({ featureName: 'groups' });
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const text = result.content[0].text;

      // Simplified one-way messaging must be explicitly visible so the calling
      // agent cannot miss that install cannot be undone from this tool. We
      // deliberately do NOT reference a specific uninstall process (e.g. support
      // channels or rollback) — those were fabricated and have been removed.
      expect(text).toContain('cannot be undone');
      // Assert the full literal phrase to lock the contract.
      expect(text).toContain('Install complete. This action cannot be undone.');

      // Transaction ID must be surfaced via formatSuccess.
      expect(text).toContain('Transaction ID: tx-install-idm-feature-1');

      // Body must parse to the wrapped shape: _id from input, status=installed,
      // apiResponse preserves the upstream payload verbatim.
      const [jsonPart] = text.split('\n\nTransaction ID:');
      const parsed = JSON.parse(jsonPart);
      expect(parsed._id).toBe('groups');
      expect(parsed.status).toBe('installed');
      expect(parsed.message).toBe('Install complete. This action cannot be undone.');
      expect(parsed.apiResponse).toEqual(upstream);
    });

    it('does NOT block featureName=aiagent (locked decision #8 — install-aiagent is allowed, steer via description)', async () => {
      // The generic tool must NOT reject `aiagent` at the schema or runtime level.
      // Users who want ONLY the IDM-side install for the `aiagent` feature are
      // allowed; the description steers them toward enableAiAgent for the full
      // end-to-end path, but the generic install path is still valid.
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return HttpResponse.json({ status: 200, message: 'Install complete.' });
        })
      );

      // Schema parse must succeed (no runtime block).
      const schema = installIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse('aiagent')).not.toThrow();

      // Tool execution must succeed and reach the wrapped success response.
      const result = await installIdmFeatureTool.toolFunction({ featureName: 'aiagent' });
      expect(result.content[0].text).not.toContain('Failed to install');

      const [jsonPart] = result.content[0].text.split('\n\nTransaction ID:');
      const parsed = JSON.parse(jsonPart);
      expect(parsed._id).toBe('aiagent');
      expect(parsed.status).toBe('installed');
    });

    it('still returns the wrapped success shape when the upstream body is absent (null)', async () => {
      // Tolerate 204 / empty-body shapes: apiHelpers returns data=null in that case.
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      const result = await installIdmFeatureTool.toolFunction({ featureName: 'groups' });
      const [jsonPart] = result.content[0].text.split('\n\nTransaction ID:');
      const parsed = JSON.parse(jsonPart);
      expect(parsed._id).toBe('groups');
      expect(parsed.status).toBe('installed');
      expect(parsed.apiResponse).toBeNull();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it.each(['groups', 'aiagent', 'password/timestamps', 'indexed/strings/6thru20', 'am/2fa/profiles'])(
      'accepts valid feature name: "%s"',
      (value) => {
        const schema = installIdmFeatureTool.inputSchema.featureName;
        expect(schema.parse(value)).toBe(value);
      }
    );

    it.each([
      '..',
      '/groups',
      'groups/',
      'foo//bar',
      'foo/../bar',
      '%2e%2e',
      '%2E%2E',
      'foo%2fbar',
      'foo.bar',
      'foo\\bar'
    ])('rejects path-traversal / invalid feature name: "%s"', (value) => {
      const schema = installIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse(value)).toThrow();
    });

    it('rejects empty string', () => {
      const schema = installIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse('')).toThrow();
    });

    it('rejects whitespace-only string', () => {
      const schema = installIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse('   ')).toThrow();
    });

    it('requires featureName parameter', () => {
      const schema = installIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse(undefined)).toThrow();
    });
  });

  // ===== DESCRIPTION CROSS-REFERENCES =====
  describe('Description Cross-References', () => {
    it('references enableAiAgent as the preferred path for AI Agents', () => {
      expect(installIdmFeatureTool.description).toContain('enableAiAgent');
    });

    it('flags one-way / cannot be undone', () => {
      expect(installIdmFeatureTool.description.toLowerCase()).toMatch(/one-way|cannot be undone/);
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('400 pre-validate failure surfaces the upstream `detail` payload to the caller', async () => {
      // JsonDefinedFeature.install() runs validate first; pre-validate failure
      // returns HTTP 400 with body `{ code, message: "Pre-validate failed.", detail }`.
      // The tool must surface the `detail` field verbatim so callers can diagnose
      // the underlying blocker (not just see a 400 status code).
      const detailPayload = {
        status: 200,
        success: false,
        message:
          'Validate complete. Feature cannot be installed: managed/user schema extension conflict on field `aiAgentsConfig`.'
      };
      const errorBody = {
        code: 400,
        message: 'Pre-validate failed.',
        detail: detailPayload
      };

      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return new HttpResponse(JSON.stringify(errorBody), { status: 400 });
        })
      );

      const result = await installIdmFeatureTool.toolFunction({ featureName: 'aiagent' });
      const text = result.content[0].text;

      // Standard error envelope.
      expect(text).toContain('Failed to install IDM feature');
      expect(text).toContain('aiagent');
      expect(text).toContain('400');

      // CRITICAL — the upstream `detail` must be surfaced so the caller sees the
      // specific validation blocker that prevented install. `formatError` includes
      // the raw error body in non-production mode; we assert the distinctive
      // detail-message substring is present.
      expect(text).toContain('Pre-validate failed.');
      expect(text).toContain('managed/user schema extension conflict');
      expect(text).toContain('aiAgentsConfig');
    });

    it('404 unknown feature surfaces "Failed to install IDM feature" prefix + status + feature name', async () => {
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found', message: 'Feature not found' }), {
            status: 404
          });
        })
      );

      const result = await installIdmFeatureTool.toolFunction({ featureName: 'does-not-exist' });

      expect(result.content[0].text).toContain('Failed to install IDM feature');
      expect(result.content[0].text).toContain('does-not-exist');
      expect(result.content[0].text).toContain('404');
    });

    it.each([
      {
        name: '401 Unauthorized surfaces prefix + status',
        status: 401,
        body: { error: 'unauthorized', message: 'Invalid credentials' }
      },
      {
        name: '403 Forbidden surfaces prefix + status',
        status: 403,
        body: { error: 'forbidden', message: 'Missing required scope' }
      },
      {
        name: '500 Internal Server Error surfaces prefix + status',
        status: 500,
        body: { error: 'internal_error', message: 'Server error' }
      }
    ])('$name', async ({ status, body }) => {
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await installIdmFeatureTool.toolFunction({ featureName: 'groups' });

      expect(result.content[0].text).toContain('Failed to install IDM feature');
      expect(result.content[0].text).toContain('groups');
      expect(result.content[0].text).toContain(String(status));
    });
  });
});
