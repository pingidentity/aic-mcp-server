import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_OAUTH2_CLIENT_HEADERS } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:am:*', 'fr:idm:*'];

export const getOidcAppTool = {
  name: 'getOidcApp',
  title: 'Get OIDC App',
  description: 'Retrieves a complete OIDC application configuration.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm'),
    name: z.string().min(1).describe('The application name')
  },
  async toolFunction({ realm, name }: { realm: (typeof REALMS)[number]; name: string }) {
    try {
      // Look up IDM managed application by name
      const idmQueryUrl =
        `https://${aicBaseUrl}/openidm/managed/${realm}_application` +
        `?_queryFilter=${encodeURIComponent(`name eq "${name}"`)}&_fields=*`;
      const { data: idmQueryData, response: idmResponse } = await makeAuthenticatedRequest(idmQueryUrl, SCOPES, {
        method: 'GET'
      });
      const idmResults = (idmQueryData as { result: any[] }).result;

      if (!idmResults?.length) {
        return createToolResponse(`No application found with name "${name}" in realm "${realm}".`);
      }

      const managedApp = idmResults[0];
      const clientId = managedApp.ssoEntities?.oidcId;

      // Fetch AM OAuth2Client if linked
      let oauth2Client = null;
      let amResponse: Response | null = null;
      if (clientId) {
        const amUrl = buildAMRealmUrl(realm, `realm-config/agents/OAuth2Client/${encodeURIComponent(clientId)}`);
        try {
          const { data, response } = await makeAuthenticatedRequest(amUrl, SCOPES, {
            method: 'GET',
            headers: AM_OAUTH2_CLIENT_HEADERS
          });
          oauth2Client = data;
          amResponse = response;
        } catch {
          // AM client may not exist — still return IDM data
        }
      }

      const result: Record<string, any> = {
        oauth2Client,
        managedApplication: managedApp,
        idmTransactionId: idmResponse.headers.get('x-forgerock-transactionid'),
        amTransactionId: amResponse?.headers.get('x-forgerock-transactionid')
      };

      return createToolResponse(JSON.stringify(result, null, 2));
    } catch (error: any) {
      return createToolResponse(`Failed to get OIDC app: ${error.message}`);
    }
  }
};
