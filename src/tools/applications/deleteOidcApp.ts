import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_OAUTH2_CLIENT_HEADERS } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:am:*', 'fr:idm:*'];

export const deleteOidcAppTool = {
  name: 'deleteOidcApp',
  title: 'Delete OIDC App',
  description: 'Deletes an OIDC application.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
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
        `?_queryFilter=${encodeURIComponent(`name eq "${name}"`)}&_fields=_id,ssoEntities`;
      const { data: queryData } = await makeAuthenticatedRequest(idmQueryUrl, SCOPES, {
        method: 'GET'
      });
      const idmResults = (queryData as { result: Array<{ _id: string; ssoEntities?: { oidcId?: string } }> }).result;

      if (!idmResults?.length) {
        return createToolResponse(`No application found with name "${name}" in realm "${realm}".`);
      }

      const managedApp = idmResults[0];
      const clientId = managedApp.ssoEntities?.oidcId;
      const deleted: string[] = [];

      // Delete IDM managed application
      const idmDeleteUrl = `https://${aicBaseUrl}/openidm/managed/${realm}_application/${managedApp._id}`;
      const { response: idmResponse } = await makeAuthenticatedRequest(idmDeleteUrl, SCOPES, { method: 'DELETE' });
      deleted.push(`IDM managed application (${managedApp._id})`);

      // Delete AM OAuth2Client if linked
      let lastResponse: Response = idmResponse;
      if (clientId) {
        const amUrl = buildAMRealmUrl(realm, `realm-config/agents/OAuth2Client/${encodeURIComponent(clientId)}`);
        const { response: amResponse } = await makeAuthenticatedRequest(amUrl, SCOPES, {
          method: 'DELETE',
          headers: AM_OAUTH2_CLIENT_HEADERS
        });
        deleted.push(`AM OAuth2Client (${clientId})`);
        lastResponse = amResponse;
      }

      return createToolResponse(formatSuccess({ deleted }, lastResponse));
    } catch (error: any) {
      return createToolResponse(`Failed to delete OIDC app: ${error.message}`);
    }
  }
};
