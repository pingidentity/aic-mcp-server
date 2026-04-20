import { describe, it, expect } from 'vitest';
import { enableAiAgentTool } from '../../../src/tools/featureManagement/enableAiAgent.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('enableAiAgent', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('enableAiAgent', enableAiAgentTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    const setupEnableEndpoint = () =>
      server.use(
        http.post('https://*/environment/aiagent', () => {
          return HttpResponse.json({});
        })
      );

    it('POSTs /environment/aiagent?_action=enable with combined AM+IDM scopes and an empty JSON body', async () => {
      setupEnableEndpoint();

      await enableAiAgentTool.toolFunction();

      const [url, scopes, options] = getSpy().mock.calls.at(-1)!;
      expect(url).toBe('https://test.forgeblocks.com/environment/aiagent?_action=enable');
      // Scopes are both `fr:am:*` and `fr:idm:*` — the bespoke endpoint orchestrates
      // the IDM feature install AND the AM OAuth2 realm-config step so both are required.
      expect(scopes).toEqual(['fr:am:*', 'fr:idm:*']);
      expect(options).toBeDefined();
      expect(options!.method).toBe('POST');
      // Empty-object body ensures makeAuthenticatedRequest sets Content-Type: application/json.
      expect(options!.body).toBe('{}');
    });

    it('hardcodes ?_action=enable (never taken from user input — no inputs exist)', async () => {
      setupEnableEndpoint();

      await enableAiAgentTool.toolFunction();

      const [url] = getSpy().mock.calls.at(-1)!;
      expect(url).toContain('?_action=enable');
      expect(url.endsWith('?_action=enable')).toBe(true);
    });

    it('sets Content-Type: application/json via the empty JSON body (body presence asserted)', async () => {
      // The Content-Type header is added by makeAuthenticatedRequest when `options.body`
      // is truthy (see src/utils/apiHelpers.ts). Assert at the call boundary that
      // body is a non-empty string that parses to an empty object.
      setupEnableEndpoint();

      await enableAiAgentTool.toolFunction();

      const [, , options] = getSpy().mock.calls.at(-1)!;
      expect(options!.body).toBeTruthy();
      expect(typeof options!.body).toBe('string');
      expect(JSON.parse(options!.body as string)).toEqual({});
    });

    it('declares the same scopes on the tool object', () => {
      expect(enableAiAgentTool.scopes).toEqual(['fr:am:*', 'fr:idm:*']);
    });

    it('declares destructive + idempotent annotations (install is one-way but re-running is safe)', () => {
      // Locked decision #4: destructive because the IDM install it triggers is
      // one-way and cannot be undone from this tool. idempotent=true per
      // FRAAS-31357 AC — re-running the bespoke endpoint is safe.
      expect(enableAiAgentTool.annotations).toEqual({
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      });
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    // The 200 response body shape is undocumented per public docs + requirements §6.
    // `makeAuthenticatedRequest` already normalizes 204 / content-length:0 to `data: null`
    // (see src/utils/apiHelpers.ts:37). All three shapes — null, {}, structured object —
    // must flow through untouched as `apiResponse` in the wrapped success body.

    it('tolerates a 204 / empty-body response by surfacing apiResponse=null', async () => {
      server.use(
        http.post('https://*/environment/aiagent', () => {
          return new HttpResponse(null, {
            status: 204,
            headers: { 'x-forgerock-transactionid': 'tx-enable-aiagent-null' }
          });
        })
      );

      const result = await enableAiAgentTool.toolFunction();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const text = result.content[0].text;
      expect(text).toContain('Transaction ID: tx-enable-aiagent-null');

      const [jsonPart] = text.split('\n\nTransaction ID:');
      const parsed = JSON.parse(jsonPart);
      expect(parsed.status).toBe('enabled');
      expect(parsed.message).toContain('end-to-end');
      // Simplified one-way messaging — no fabricated uninstall process references.
      expect(parsed.message).toContain('cannot be undone');
      expect(parsed.apiResponse).toBeNull();
    });

    it('tolerates a 200 response with an empty JSON object body by surfacing apiResponse={}', async () => {
      server.use(
        http.post('https://*/environment/aiagent', () => {
          return HttpResponse.json({}, { headers: { 'x-forgerock-transactionid': 'tx-enable-aiagent-empty-obj' } });
        })
      );

      const result = await enableAiAgentTool.toolFunction();
      const text = result.content[0].text;
      expect(text).toContain('Transaction ID: tx-enable-aiagent-empty-obj');

      const [jsonPart] = text.split('\n\nTransaction ID:');
      const parsed = JSON.parse(jsonPart);
      expect(parsed.status).toBe('enabled');
      expect(parsed.message).toContain('end-to-end');
      expect(parsed.apiResponse).toEqual({});
    });

    it('tolerates a 200 response with a structured object body by surfacing it verbatim in apiResponse', async () => {
      const upstream = {
        status: 'enabled',
        idmFeatureInstalled: true,
        amRealms: {
          alpha: { aiAgentsEnabled: true },
          bravo: { aiAgentsEnabled: true }
        }
      };

      server.use(
        http.post('https://*/environment/aiagent', () => {
          return HttpResponse.json(upstream, {
            headers: { 'x-forgerock-transactionid': 'tx-enable-aiagent-structured' }
          });
        })
      );

      const result = await enableAiAgentTool.toolFunction();
      const text = result.content[0].text;
      expect(text).toContain('Transaction ID: tx-enable-aiagent-structured');

      const [jsonPart] = text.split('\n\nTransaction ID:');
      const parsed = JSON.parse(jsonPart);
      expect(parsed.status).toBe('enabled');
      expect(parsed.message).toContain('end-to-end');
      // The upstream body is surfaced verbatim — the wrapper must not rename, drop,
      // or re-key any fields. Callers depend on `apiResponse` being the raw API payload.
      expect(parsed.apiResponse).toEqual(upstream);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('has an empty input schema (no user inputs)', () => {
      // No-input convention — guards against a regression adding required inputs
      // to a tool that the design intentionally declares as argument-free.
      expect(enableAiAgentTool.inputSchema).toEqual({});
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('500 Internal Server Error surfaces "Failed to enable AI Agents" prefix + status', async () => {
      // Public docs document only 200 (success) and 500 (failure) status codes for
      // this bespoke endpoint. 500 is the primary failure path.
      server.use(
        http.post('https://*/environment/aiagent', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'internal_error', message: 'Enablement orchestration failed' }),
            { status: 500 }
          );
        })
      );

      const result = await enableAiAgentTool.toolFunction();

      expect(result.content[0].text).toContain('Failed to enable AI Agents');
      expect(result.content[0].text).toContain('500');
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
        name: '400 Bad Request surfaces prefix + status (if this ever happens)',
        status: 400,
        body: { error: 'bad_request', message: 'Malformed request' }
      }
    ])('$name', async ({ status, body }) => {
      server.use(
        http.post('https://*/environment/aiagent', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await enableAiAgentTool.toolFunction();

      expect(result.content[0].text).toContain('Failed to enable AI Agents');
      expect(result.content[0].text).toContain(String(status));
    });
  });
});
