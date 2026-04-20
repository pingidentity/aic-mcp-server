import { describe, it, expect } from 'vitest';
import { validateIdmFeatureTool } from '../../../src/tools/featureManagement/validateIdmFeature.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('validateIdmFeature', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('validateIdmFeature', validateIdmFeatureTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    const setupValidateEndpoint = () =>
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return HttpResponse.json({
            status: 200,
            success: true,
            message: 'Validate complete.'
          });
        })
      );

    it('POSTs /openidm/feature/<featureName>?_action=validate with IDM scopes and an empty JSON body', async () => {
      setupValidateEndpoint();

      await validateIdmFeatureTool.toolFunction({ featureName: 'groups' });

      const [url, scopes, options] = getSpy().mock.calls.at(-1)!;
      expect(url).toBe('https://test.forgeblocks.com/openidm/feature/groups?_action=validate');
      expect(scopes).toEqual(['fr:idm:*']);
      expect(options).toBeDefined();
      expect(options!.method).toBe('POST');
      // Empty-object body ensures makeAuthenticatedRequest sets Content-Type: application/json.
      expect(options!.body).toBe('{}');
    });

    it('hardcodes ?_action=validate (never taken from user input)', async () => {
      setupValidateEndpoint();

      await validateIdmFeatureTool.toolFunction({ featureName: 'aiagent' });

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('?_action=validate');
      expect(url.endsWith('?_action=validate')).toBe(true);
    });

    it('preserves `/` as a separator for slash-containing feature names (per-segment encoding)', async () => {
      setupValidateEndpoint();

      await validateIdmFeatureTool.toolFunction({ featureName: 'password/timestamps' });

      const [url] = getSpy().mock.calls.at(-1)!;
      // The `/` must be preserved literally — NOT encoded as %2F — so the IDM
      // router parses the remainder of the path as the feature id.
      expect(url).toBe('https://test.forgeblocks.com/openidm/feature/password/timestamps?_action=validate');
    });

    it('sets Content-Type: application/json via the empty JSON body (verified by body presence)', async () => {
      // The Content-Type header is added by makeAuthenticatedRequest when `options.body`
      // is truthy (see src/utils/apiHelpers.ts). We assert at the call boundary that
      // body is a non-empty string so the helper will add the header.
      setupValidateEndpoint();

      await validateIdmFeatureTool.toolFunction({ featureName: 'groups' });

      const [, , options] = getSpy().mock.calls.at(-1)!;
      expect(options!.body).toBeTruthy();
      expect(typeof options!.body).toBe('string');
      // Parsing must succeed and the body must represent an empty object.
      expect(JSON.parse(options!.body as string)).toEqual({});
    });

    it('declares the same scopes on the tool object', () => {
      expect(validateIdmFeatureTool.scopes).toEqual(['fr:idm:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('returns the 200 success body verbatim when `success: true`', async () => {
      const mockBody = {
        status: 200,
        success: true,
        message: 'Validate complete.'
      };

      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return HttpResponse.json(mockBody);
        })
      );

      const result = await validateIdmFeatureTool.toolFunction({ featureName: 'groups' });
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const [jsonPart] = result.content[0].text.split('\n\nTransaction ID:');
      const parsed = JSON.parse(jsonPart);
      expect(parsed).toEqual(mockBody);
    });

    it('returns the 200 body verbatim when `success: false` — NOT treated as an error', async () => {
      // CRITICAL: the validate endpoint uses body-level `success: false` to report
      // validation failures with a 200 HTTP status. The tool must surface this as
      // normal data so the caller can read the message and decide next steps.
      const mockBody = {
        status: 200,
        success: false,
        message: 'Validate complete. Feature cannot be installed: pre-condition X not met.'
      };

      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return HttpResponse.json(mockBody);
        })
      );

      const result = await validateIdmFeatureTool.toolFunction({ featureName: 'aiagent' });

      // Must NOT be surfaced as an error (no "Failed to validate" prefix).
      expect(result.content[0].text).not.toContain('Failed to validate');

      const [jsonPart] = result.content[0].text.split('\n\nTransaction ID:');
      const parsed = JSON.parse(jsonPart);
      expect(parsed).toEqual(mockBody);
      expect(parsed.success).toBe(false);
      expect(parsed.message).toContain('Feature cannot be installed');
    });

    it('surfaces the transaction ID when present', async () => {
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return HttpResponse.json(
            { status: 200, success: true, message: 'Validate complete.' },
            { headers: { 'x-forgerock-transactionid': 'tx-validate-idm-feature-1' } }
          );
        })
      );

      const result = await validateIdmFeatureTool.toolFunction({ featureName: 'groups' });
      expect(result.content[0].text).toContain('Transaction ID: tx-validate-idm-feature-1');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it.each(['groups', 'aiagent', 'password/timestamps', 'indexed/strings/6thru20', 'am/2fa/profiles'])(
      'accepts valid feature name: "%s"',
      (value) => {
        const schema = validateIdmFeatureTool.inputSchema.featureName;
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
      const schema = validateIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse(value)).toThrow();
    });

    it('rejects empty string', () => {
      const schema = validateIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse('')).toThrow();
    });

    it('rejects whitespace-only string', () => {
      const schema = validateIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse('   ')).toThrow();
    });

    it('requires featureName parameter', () => {
      const schema = validateIdmFeatureTool.inputSchema.featureName;
      expect(() => schema.parse(undefined)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('404 unknown feature surfaces "Failed to validate IDM feature" prefix + status + feature name', async () => {
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found', message: 'Feature not found' }), {
            status: 404
          });
        })
      );

      const result = await validateIdmFeatureTool.toolFunction({ featureName: 'does-not-exist' });

      expect(result.content[0].text).toContain('Failed to validate IDM feature');
      expect(result.content[0].text).toContain('does-not-exist');
      expect(result.content[0].text).toContain('404');
    });

    it('400 unsupported action surfaces "Failed to validate IDM feature" prefix + status', async () => {
      // The tool hardcodes `?_action=validate`, so this path should not trigger in
      // practice, but we still exercise it to prove the error branch works cleanly.
      server.use(
        http.post('https://*/openidm/feature/*', () => {
          return new HttpResponse(JSON.stringify({ code: 400, message: 'Unsupported action' }), { status: 400 });
        })
      );

      const result = await validateIdmFeatureTool.toolFunction({ featureName: 'groups' });

      expect(result.content[0].text).toContain('Failed to validate IDM feature');
      expect(result.content[0].text).toContain('groups');
      expect(result.content[0].text).toContain('400');
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

      const result = await validateIdmFeatureTool.toolFunction({ featureName: 'groups' });

      expect(result.content[0].text).toContain('Failed to validate IDM feature');
      expect(result.content[0].text).toContain('groups');
      expect(result.content[0].text).toContain(String(status));
    });
  });
});
