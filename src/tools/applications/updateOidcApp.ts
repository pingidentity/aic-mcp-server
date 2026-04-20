import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';

import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_OAUTH2_CLIENT_HEADERS } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:am:*', 'fr:idm:*'];

function deepMergeOAuth2Config(current: Record<string, any>, updates: Record<string, any>): Record<string, any> {
  const merged = structuredClone(current);
  for (const [key, value] of Object.entries(updates)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof merged[key] === 'object' &&
      merged[key] !== null &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = { ...merged[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export const updateOidcAppTool = {
  name: 'updateOidcApp',
  title: 'Update OIDC App',
  description:
    'Updates an OIDC application. You can update the client configuration, ' + 'the application metadata, or both.',
  scopes: SCOPES,
  annotations: {
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm'),
    name: z.string().min(1).describe('The application name'),
    oauth2Client: z
      .record(z.any())
      .optional()
      .describe(
        'Partial OIDC client configuration. Provide only the properties you want to change, ' +
          'nested under their configuration sections. Omit to skip this update.'
      ),
    managedApplication: z
      .object({
        _rev: z.string().min(1).describe('The current revision (_rev) of the application, obtained from getOidcApp'),
        operations: z
          .array(
            z.object({
              operation: z.enum(['add', 'remove', 'replace']),
              field: z.string(),
              value: z.any().optional()
            })
          )
          .describe('JSON Patch operations to apply')
      })
      .optional()
      .describe('Application metadata patch. Omit to skip this update.')
  },
  async toolFunction({
    realm,
    name,
    oauth2Client,
    managedApplication
  }: {
    realm: (typeof REALMS)[number];
    name: string;
    oauth2Client?: Record<string, any>;
    managedApplication?: {
      _rev: string;
      operations: Array<{ operation: string; field: string; value?: any }>;
    };
  }) {
    try {
      if (!oauth2Client && !managedApplication) {
        return createToolResponse('Nothing to update: provide oauth2Client, managedApplication, or both.');
      }

      // Look up IDM managed application by name to resolve _id and clientId
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

      const appRecord = idmResults[0];
      const clientId = appRecord.ssoEntities?.oidcId;
      const results: Record<string, any> = {};

      // Update AM OAuth2Client (GET current, merge, PUT)
      if (oauth2Client) {
        if (!clientId) {
          return createToolResponse(
            'Cannot update client configuration: no linked client ID found on this application.'
          );
        }
        const amUrl = buildAMRealmUrl(realm, `realm-config/agents/OAuth2Client/${encodeURIComponent(clientId)}`);

        const { data: currentConfig } = await makeAuthenticatedRequest(amUrl, SCOPES, {
          method: 'GET',
          headers: AM_OAUTH2_CLIENT_HEADERS
        });

        const currentObj = currentConfig as Record<string, any>;
        const rev = currentObj._rev;
        delete currentObj._id;
        delete currentObj._rev;
        delete currentObj._type;
        const mergedConfig = deepMergeOAuth2Config(currentObj, oauth2Client);

        const { data, response } = await makeAuthenticatedRequest(amUrl, SCOPES, {
          method: 'PUT',
          headers: {
            ...AM_OAUTH2_CLIENT_HEADERS,
            'If-Match': rev
          },
          body: JSON.stringify(mergedConfig)
        });
        results.oauth2Client = data;
        results.amTransactionId = response.headers.get('x-forgerock-transactionid');
      }

      // Patch IDM managed application
      if (managedApplication) {
        // Strip ssoEntities from patch operations to protect the AM-IDM link
        const safeOperations = managedApplication.operations.filter(
          (op) => !op.field.startsWith('/ssoEntities') && op.field !== 'ssoEntities'
        );

        const idmUrl = `https://${aicBaseUrl}/openidm/managed/${realm}_application/${appRecord._id}`;
        const { data, response } = await makeAuthenticatedRequest(idmUrl, SCOPES, {
          method: 'PATCH',
          headers: {
            'If-Match': managedApplication._rev
          },
          body: JSON.stringify(safeOperations)
        });
        results.managedApplication = data;
        results.idmTransactionId = response.headers.get('x-forgerock-transactionid');
      }

      return createToolResponse(JSON.stringify(results, null, 2));
    } catch (error: any) {
      return createToolResponse(`Failed to update OIDC app: ${error.message}`);
    }
  }
};
