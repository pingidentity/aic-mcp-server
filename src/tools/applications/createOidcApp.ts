import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_OAUTH2_CLIENT_HEADERS } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:am:*', 'fr:idm:*'];

export const createOidcAppTool = {
  name: 'createOidcApp',
  title: 'Create OIDC App',
  description:
    'Creates an OIDC application. Only supply the oauth2Client fields you want to set; ' +
    'defaults are applied for the rest.',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm'),
    name: z.string().min(1).describe('The application display name'),
    clientId: safePathSegmentSchema.describe('The OAuth2 client ID used in protocol flows'),
    owners: z
      .array(z.record(z.any()))
      .min(1)
      .describe('Application owners. Example: [{"_ref": "managed/alpha_user/USER_ID"}]'),
    oauth2Client: z
      .record(z.any())
      .optional()
      .describe(
        'OIDC client configuration. Each property uses the wrapper format ' +
          '{"inherited": false, "value": <val>}, nested under config sections. ' +
          'Example: {"coreOAuth2ClientConfig": {"redirectionUris": {"inherited": false, "value": ["https://example.com/callback"]}}}'
      )
  },
  async toolFunction({
    realm,
    name,
    clientId,
    owners,
    oauth2Client
  }: {
    realm: (typeof REALMS)[number];
    name: string;
    clientId: string;
    owners: Array<Record<string, any>>;
    oauth2Client?: Record<string, any>;
  }) {
    try {
      // Build AM payload, syncing name to clientName if not explicitly set
      const amPayload = structuredClone(oauth2Client || {});
      if (!amPayload.coreOAuth2ClientConfig) {
        amPayload.coreOAuth2ClientConfig = {};
      }
      const clientNameProp = amPayload.coreOAuth2ClientConfig.clientName;
      if (!clientNameProp?.value || (Array.isArray(clientNameProp.value) && clientNameProp.value.length === 0)) {
        amPayload.coreOAuth2ClientConfig.clientName = {
          inherited: false,
          value: [name]
        };
      }

      // Create AM OAuth2Client (PUT with If-None-Match: * for safety)
      const amUrl = buildAMRealmUrl(realm, `realm-config/agents/OAuth2Client/${encodeURIComponent(clientId)}`);
      const { data: amData } = await makeAuthenticatedRequest(amUrl, SCOPES, {
        method: 'PUT',
        headers: {
          ...AM_OAUTH2_CLIENT_HEADERS,
          'If-None-Match': '*'
        },
        body: JSON.stringify(amPayload)
      });

      // Create IDM managed application with linking fields
      const idmPayload = {
        name,
        owners,
        ssoEntities: { oidcId: clientId },
        templateName: 'custom',
        templateVersion: '1.0'
      };

      const idmUrl = `https://${aicBaseUrl}/openidm/managed/${realm}_application?_action=create`;
      const { data: idmData, response: idmResponse } = await makeAuthenticatedRequest(idmUrl, SCOPES, {
        method: 'POST',
        body: JSON.stringify(idmPayload)
      });

      const result = {
        oauth2Client: amData,
        managedApplication: idmData
      };

      return createToolResponse(formatSuccess(result, idmResponse));
    } catch (error: any) {
      return createToolResponse(`Failed to create OIDC app: ${error.message}`);
    }
  }
};
