// src/tools/featureManagement/listFeatures.ts
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const AM_PROBE_HEADERS = {
  'accept-api-version': 'protocol=2.1,resource=1.0'
} as const;

const SCOPES = ['fr:am:*', 'fr:idm:*'];
const IDM_SCOPES = ['fr:idm:*'];
const AM_SCOPES = ['fr:am:*'];

type Realm = 'alpha' | 'bravo';

function amRealmConfigUrl(realm: Realm): string {
  return `https://${aicBaseUrl}/am/json/realms/root/realms/${realm}/realm-config/services/oauth-oidc`;
}

interface IdmFeatureRecord {
  _id: string;
  installedVersion: string | null;
  availableVersions: string[];
}

interface AiAgentsConfig {
  aiAgentsEnabled?: boolean;
  [key: string]: unknown;
}

interface AmRealmProbeDetail {
  configured: boolean;
  error: string | null;
}

function summarizeAmProbe(settled: PromiseSettledResult<{ data: unknown; response: Response }>): {
  detail: AmRealmProbeDetail;
  ok: boolean;
} {
  if (settled.status === 'rejected') {
    const err = settled.reason as Error;
    return {
      detail: { configured: false, error: err?.message ?? String(err) },
      ok: false
    };
  }

  const { data } = settled.value;
  const providerConfig = (data ?? {}) as { aiAgentsConfig?: AiAgentsConfig };
  const rawConfig =
    providerConfig.aiAgentsConfig && typeof providerConfig.aiAgentsConfig === 'object'
      ? providerConfig.aiAgentsConfig
      : null;
  return {
    detail: { configured: !!(rawConfig && rawConfig.aiAgentsEnabled === true), error: null },
    ok: true
  };
}

export function computeAiAgentStatus(
  alpha: { ok: boolean; detail: AmRealmProbeDetail },
  bravo: { ok: boolean; detail: AmRealmProbeDetail },
  idmInstalled: boolean
): 'installed' | 'not_installed' | 'indeterminate' {
  const allOk = alpha.ok && bravo.ok;
  if (!allOk) return 'indeterminate';

  const alphaConfigured = alpha.detail.configured;
  const bravoConfigured = bravo.detail.configured;

  if (idmInstalled && alphaConfigured && bravoConfigured) return 'installed';
  if (!idmInstalled && !alphaConfigured && !bravoConfigured) return 'not_installed';
  return 'indeterminate';
}

interface UnifiedFeature {
  name: string;
  type: 'idm' | 'aic';
  installed: boolean;
  installedVersion?: string | null;
  availableVersions?: string[];
  status?: 'installed' | 'not_installed' | 'indeterminate';
  message?: string;
  details?: {
    idm: { installed: boolean };
    am: {
      alpha: AmRealmProbeDetail;
      bravo: AmRealmProbeDetail;
    };
  };
}

function buildAiAgentMessage(status: 'installed' | 'not_installed' | 'indeterminate'): string {
  switch (status) {
    case 'installed':
      return 'AI Agents is installed.';
    case 'not_installed':
      return 'AI Agents is not installed. Run `enableAiAgent` to install.';
    case 'indeterminate':
    default:
      return 'AI Agents installation status is indeterminate — components are in an inconsistent or partially installed state. Run `enableAiAgent` to complete or repair the installation.';
  }
}

export const listFeaturesTool = {
  name: 'listFeatures',
  title: 'List Features',
  description:
    'List all available features in PingOne AIC and whether they are installed. Returns a unified list of IDM features and AIC platform features (e.g. AI Agents) with install status. This is the single tool to call when checking what features exist and their state.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {},
  async toolFunction() {
    const idmUrl = `https://${aicBaseUrl}/openidm/feature?_queryFilter=true`;
    const alphaUrl = amRealmConfigUrl('alpha');
    const bravoUrl = amRealmConfigUrl('bravo');

    const [idmSettled, alphaSettled, bravoSettled] = await Promise.allSettled([
      makeAuthenticatedRequest(idmUrl, IDM_SCOPES),
      makeAuthenticatedRequest(alphaUrl, AM_SCOPES, { method: 'GET', headers: { ...AM_PROBE_HEADERS } }),
      makeAuthenticatedRequest(bravoUrl, AM_SCOPES, { method: 'GET', headers: { ...AM_PROBE_HEADERS } })
    ]);

    const features: UnifiedFeature[] = [];

    // --- IDM features ---
    let idmAiAgentInstalled = false;
    if (idmSettled.status === 'fulfilled') {
      const idmData = idmSettled.value.data as { result?: IdmFeatureRecord[] };
      const idmFeatures = idmData?.result ?? [];
      for (const f of idmFeatures) {
        if (f._id === 'aiagent') {
          idmAiAgentInstalled = (f.installedVersion ?? null) !== null;
          continue;
        }
        features.push({
          name: f._id,
          type: 'idm',
          installed: (f.installedVersion ?? null) !== null,
          installedVersion: f.installedVersion,
          availableVersions: f.availableVersions
        });
      }
    } else {
      const err = idmSettled.reason as Error;
      return createToolResponse(`Failed to list features: ${err?.message ?? String(err)}`);
    }

    // --- AIC: AI Agents composite status ---
    const alpha = summarizeAmProbe(alphaSettled);
    const bravo = summarizeAmProbe(bravoSettled);
    const aiAgentStatus = computeAiAgentStatus(alpha, bravo, idmAiAgentInstalled);

    features.push({
      name: 'AI Agents',
      type: 'aic',
      installed: aiAgentStatus === 'installed',
      status: aiAgentStatus,
      message: buildAiAgentMessage(aiAgentStatus),
      details: {
        idm: { installed: idmAiAgentInstalled },
        am: {
          alpha: alpha.detail,
          bravo: bravo.detail
        }
      }
    });

    const body = { features };
    return createToolResponse(JSON.stringify(body, null, 2));
  }
};
