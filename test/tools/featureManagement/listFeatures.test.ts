import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listFeaturesTool, computeAiAgentStatus } from '../../../src/tools/featureManagement/listFeatures.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { getAllTools, getAllScopes } from '../../../src/utils/toolHelpers.js';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

const IDM_URL = 'https://test.forgeblocks.com/openidm/feature?_queryFilter=true';
const ALPHA_URL = 'https://test.forgeblocks.com/am/json/realms/root/realms/alpha/realm-config/services/oauth-oidc';
const BRAVO_URL = 'https://test.forgeblocks.com/am/json/realms/root/realms/bravo/realm-config/services/oauth-oidc';

interface ProbeMock {
  data?: unknown;
  reject?: string;
}

function mockProbes(
  spy: ReturnType<typeof vi.spyOn>,
  overrides: { idm?: ProbeMock; alpha?: ProbeMock; bravo?: ProbeMock } = {}
) {
  const build = (override: ProbeMock | undefined) => {
    if (override?.reject) {
      return Promise.reject(new Error(override.reject));
    }
    const response = new Response(JSON.stringify(override?.data ?? {}), { headers: new Headers() });
    return Promise.resolve({ data: override?.data ?? {}, response });
  };

  spy.mockImplementation(async (url: string) => {
    if (url === IDM_URL) return build(overrides.idm);
    if (url === ALPHA_URL) return build(overrides.alpha);
    if (url === BRAVO_URL) return build(overrides.bravo);
    throw new Error(`Unexpected URL in test: ${url}`);
  });
}

function parseBody(text: string): any {
  return JSON.parse(text);
}

const IDM_FEATURES = [
  { _id: 'groups', installedVersion: '1', availableVersions: ['1'] },
  { _id: 'aiagent', installedVersion: null, availableVersions: ['1'] },
  { _id: 'password/timestamps', installedVersion: null, availableVersions: ['1'] }
];

function idmResponse(features = IDM_FEATURES) {
  return {
    result: features,
    resultCount: features.length,
    pagedResultsCookie: null,
    totalPagedResults: -1,
    remainingPagedResults: -1
  };
}

describe('listFeatures', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    spy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
  });

  afterEach(() => {
    spy.mockRestore();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listFeatures', listFeaturesTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('issues three parallel requests: IDM query + AM alpha + AM bravo with correct URLs and scopes', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      await listFeaturesTool.toolFunction();

      const calls = spy.mock.calls;
      expect(calls).toHaveLength(3);

      const urls = calls.map((c) => c[0] as string);
      expect(urls[0]).toBe(IDM_URL);
      expect(urls[1]).toBe(ALPHA_URL);
      expect(urls[2]).toBe(BRAVO_URL);

      expect(calls[0][1]).toEqual(['fr:idm:*']);
      expect(calls[1][1]).toEqual(['fr:am:*']);
      expect(calls[2][1]).toEqual(['fr:am:*']);
    });

    it('passes accept-api-version header on AM probes but not on IDM', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      await listFeaturesTool.toolFunction();

      const calls = spy.mock.calls;
      const idmOptions = calls[0][2] as RequestInit | undefined;
      const idmHeaders = (idmOptions?.headers ?? {}) as Record<string, string>;
      expect(idmHeaders['accept-api-version']).toBeUndefined();

      const alphaHeaders = ((calls[1][2] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
      const bravoHeaders = ((calls[2][2] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
      expect(alphaHeaders['accept-api-version']).toBe('protocol=2.1,resource=1.0');
      expect(bravoHeaders['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('declares the full combined scope set on the tool object', () => {
      expect(listFeaturesTool.scopes).toEqual(['fr:am:*', 'fr:idm:*']);
    });

    it('declares read-only + open-world annotations', () => {
      expect(listFeaturesTool.annotations).toEqual({
        readOnlyHint: true,
        openWorldHint: true
      });
    });

    it('declares an empty input schema (no parameters)', () => {
      expect(listFeaturesTool.inputSchema).toEqual({});
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    describe('computeAiAgentStatus — pure helper', () => {
      const amOk = (enabled: boolean) => ({
        ok: true,
        detail: { configured: enabled, error: null }
      });
      const amErr = () => ({
        ok: false,
        detail: { configured: false, error: 'boom' }
      });

      it('returns "installed" when IDM installed AND both realms enabled', () => {
        expect(computeAiAgentStatus(amOk(true), amOk(true), true)).toBe('installed');
      });

      it('returns "not_installed" when IDM not installed AND no realm enabled', () => {
        expect(computeAiAgentStatus(amOk(false), amOk(false), false)).toBe('not_installed');
      });

      it('returns "indeterminate" for mixed IDM-installed + no realms enabled', () => {
        expect(computeAiAgentStatus(amOk(false), amOk(false), true)).toBe('indeterminate');
      });

      it('returns "indeterminate" for mixed IDM-not-installed + both realms enabled', () => {
        expect(computeAiAgentStatus(amOk(true), amOk(true), false)).toBe('indeterminate');
      });

      it('returns "indeterminate" when only alpha is enabled (partial AM)', () => {
        expect(computeAiAgentStatus(amOk(true), amOk(false), true)).toBe('indeterminate');
      });

      it('returns "indeterminate" when only bravo is enabled (partial AM)', () => {
        expect(computeAiAgentStatus(amOk(false), amOk(true), true)).toBe('indeterminate');
      });

      it('returns "indeterminate" when any AM probe errored', () => {
        expect(computeAiAgentStatus(amErr(), amOk(true), true)).toBe('indeterminate');
        expect(computeAiAgentStatus(amOk(true), amErr(), true)).toBe('indeterminate');
      });
    });

    it('returns IDM features (excluding aiagent) + one AIC AI Agents entry', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);

      const idmFeatures = body.features.filter((f: any) => f.type === 'idm');
      const aicFeatures = body.features.filter((f: any) => f.type === 'aic');

      expect(idmFeatures).toHaveLength(2);
      expect(idmFeatures.map((f: any) => f.name)).toEqual(['groups', 'password/timestamps']);
      expect(aicFeatures).toHaveLength(1);
      expect(aicFeatures[0].name).toBe('AI Agents');
    });

    it('marks IDM features as installed/not-installed based on installedVersion', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);

      const groups = body.features.find((f: any) => f.name === 'groups');
      const timestamps = body.features.find((f: any) => f.name === 'password/timestamps');

      expect(groups.installed).toBe(true);
      expect(groups.installedVersion).toBe('1');
      expect(timestamps.installed).toBe(false);
      expect(timestamps.installedVersion).toBeNull();
    });

    it('AI Agents shows installed when IDM + both realms enabled', async () => {
      const features = [
        { _id: 'groups', installedVersion: '1', availableVersions: ['1'] },
        { _id: 'aiagent', installedVersion: '1', availableVersions: ['1'] }
      ];
      mockProbes(spy, {
        idm: { data: idmResponse(features) },
        alpha: { data: { aiAgentsConfig: { aiAgentsEnabled: true } } },
        bravo: { data: { aiAgentsConfig: { aiAgentsEnabled: true } } }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);
      const aiAgents = body.features.find((f: any) => f.name === 'AI Agents');

      expect(aiAgents.installed).toBe(true);
      expect(aiAgents.status).toBe('installed');
    });

    it('AI Agents shows not_installed when nothing is configured', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);
      const aiAgents = body.features.find((f: any) => f.name === 'AI Agents');

      expect(aiAgents.installed).toBe(false);
      expect(aiAgents.status).toBe('not_installed');
      expect(aiAgents.message).toContain('enableAiAgent');
    });

    it('AI Agents shows indeterminate for mixed state', async () => {
      const features = [
        { _id: 'groups', installedVersion: '1', availableVersions: ['1'] },
        { _id: 'aiagent', installedVersion: '1', availableVersions: ['1'] }
      ];
      mockProbes(spy, {
        idm: { data: idmResponse(features) },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);
      const aiAgents = body.features.find((f: any) => f.name === 'AI Agents');

      expect(aiAgents.installed).toBe(false);
      expect(aiAgents.status).toBe('indeterminate');
      expect(aiAgents.message).toContain('enableAiAgent');
    });

    it('AI Agents includes per-component details', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: { aiAgentsConfig: { aiAgentsEnabled: true } } },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);
      const aiAgents = body.features.find((f: any) => f.name === 'AI Agents');

      expect(aiAgents.details.idm.installed).toBe(false);
      expect(aiAgents.details.am.alpha.configured).toBe(true);
      expect(aiAgents.details.am.bravo.configured).toBe(false);
    });

    it('AI Agents shows indeterminate when an AM probe fails', async () => {
      const features = [
        { _id: 'groups', installedVersion: '1', availableVersions: ['1'] },
        { _id: 'aiagent', installedVersion: '1', availableVersions: ['1'] }
      ];
      mockProbes(spy, {
        idm: { data: idmResponse(features) },
        alpha: { reject: '500 Internal Server Error' },
        bravo: { data: { aiAgentsConfig: { aiAgentsEnabled: true } } }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);
      const aiAgents = body.features.find((f: any) => f.name === 'AI Agents');

      expect(aiAgents.status).toBe('indeterminate');
      expect(aiAgents.details.am.alpha.error).toContain('500');
      expect(aiAgents.details.am.alpha.configured).toBe(false);
      expect(aiAgents.details.am.bravo.configured).toBe(true);
    });

    it('aiAgentsEnabled="true" (string) is NOT treated as enabled', async () => {
      const features = [{ _id: 'aiagent', installedVersion: '1', availableVersions: ['1'] }];
      mockProbes(spy, {
        idm: { data: idmResponse(features) },
        alpha: { data: { aiAgentsConfig: { aiAgentsEnabled: 'true' } } },
        bravo: { data: { aiAgentsConfig: { aiAgentsEnabled: true } } }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);
      const aiAgents = body.features.find((f: any) => f.name === 'AI Agents');

      expect(aiAgents.details.am.alpha.configured).toBe(false);
      expect(aiAgents.details.am.bravo.configured).toBe(true);
      expect(aiAgents.status).toBe('indeterminate');
    });

    it('handles an empty IDM feature list', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse([]) },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);

      const idmFeatures = body.features.filter((f: any) => f.type === 'idm');
      expect(idmFeatures).toHaveLength(0);
      const aicFeatures = body.features.filter((f: any) => f.type === 'aic');
      expect(aicFeatures).toHaveLength(1);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('returns a JSON body with a features array', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const body = parseBody(result.content[0].text);
      expect(body).toHaveProperty('features');
      expect(Array.isArray(body.features)).toBe(true);
    });

    it('IDM features include installedVersion and availableVersions', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);
      const groups = body.features.find((f: any) => f.name === 'groups');

      expect(groups).toEqual({
        name: 'groups',
        type: 'idm',
        installed: true,
        installedVersion: '1',
        availableVersions: ['1']
      });
    });

    it('AIC features include status, message, and details', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);
      const aiAgents = body.features.find((f: any) => f.name === 'AI Agents');

      expect(aiAgents).toHaveProperty('status');
      expect(aiAgents).toHaveProperty('message');
      expect(aiAgents).toHaveProperty('details');
      expect(aiAgents.details).toHaveProperty('idm');
      expect(aiAgents.details).toHaveProperty('am');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('IDM probe failure returns a clean error (IDM is required for the feature list)', async () => {
      mockProbes(spy, {
        idm: { reject: '500 Internal Server Error - IDM down' },
        alpha: { data: {} },
        bravo: { data: {} }
      });

      const result = await listFeaturesTool.toolFunction();
      expect(result.content[0].text).toContain('Failed to list features');
      expect(result.content[0].text).toContain('500');
    });

    it('AM probe failure does not prevent IDM features from being returned', async () => {
      mockProbes(spy, {
        idm: { data: idmResponse() },
        alpha: { reject: '500 Internal Server Error' },
        bravo: { reject: '403 Forbidden' }
      });

      const result = await listFeaturesTool.toolFunction();
      const body = parseBody(result.content[0].text);

      const idmFeatures = body.features.filter((f: any) => f.type === 'idm');
      expect(idmFeatures).toHaveLength(2);

      const aiAgents = body.features.find((f: any) => f.name === 'AI Agents');
      expect(aiAgents.status).toBe('indeterminate');
      expect(aiAgents.details.am.alpha.error).toContain('500');
      expect(aiAgents.details.am.bravo.error).toContain('403');
    });
  });

  // ===== CATEGORY REGISTRATION TESTS =====
  describe('Category Registration', () => {
    it('listFeatures, validateIdmFeature, installIdmFeature, enableAiAgent are all registered when NOT in Docker mode', () => {
      const prev = process.env.DOCKER_CONTAINER;
      delete process.env.DOCKER_CONTAINER;
      try {
        const names = getAllTools().map((t) => t.name);
        for (const name of ['listFeatures', 'validateIdmFeature', 'installIdmFeature', 'enableAiAgent']) {
          expect(names).toContain(name);
        }
      } finally {
        if (prev !== undefined) process.env.DOCKER_CONTAINER = prev;
      }
    });

    it('all four featureManagement tools ARE still registered in Docker mode (outside the AM guard)', () => {
      const prev = process.env.DOCKER_CONTAINER;
      process.env.DOCKER_CONTAINER = 'true';
      try {
        const names = getAllTools().map((t) => t.name);
        for (const name of ['listFeatures', 'validateIdmFeature', 'installIdmFeature', 'enableAiAgent']) {
          expect(names).toContain(name);
        }
        expect(names).not.toContain('getJourney');
      } finally {
        if (prev === undefined) delete process.env.DOCKER_CONTAINER;
        else process.env.DOCKER_CONTAINER = prev;
      }
    });

    it('getAllScopes includes fr:idm:* and fr:am:* (feature management scopes collected at startup)', () => {
      const scopes = getAllScopes();
      expect(scopes).toContain('fr:idm:*');
      expect(scopes).toContain('fr:am:*');
    });
  });
});
