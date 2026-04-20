import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_OAUTH2_CLIENT_HEADERS } from '../../utils/amHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;
const SCOPES = ['fr:am:*', 'fr:idm:*'];

function summarizeAmSchema(schema: Record<string, any>): Record<string, any> {
  const sections = schema.properties || {};
  const result: Record<string, any> = {};

  for (const [sectionName, section] of Object.entries<any>(sections)) {
    const props = section.properties || {};
    const summarized: Record<string, any> = {};

    for (const [propName, prop] of Object.entries<any>(props)) {
      const entry: Record<string, any> = {
        title: prop.title,
        type: prop.properties?.value?.type ?? prop.type
      };
      const enumValues = prop.properties?.value?.enum ?? prop.enum;
      if (enumValues) {
        entry.enum = enumValues;
      }
      summarized[propName] = entry;
    }

    result[sectionName] = summarized;
  }

  return result;
}

function summarizeIdmSchema(properties: Record<string, any>, requiredFields: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [name, prop] of Object.entries<any>(properties)) {
    result[name] = {
      type: prop.type,
      required: requiredFields.includes(name)
    };
  }
  return result;
}

export const getOidcAppSchemaTool = {
  name: 'getOidcAppSchema',
  title: 'Get OIDC App Schema',
  description:
    'Returns the schema for an OIDC application. ' +
    'By default returns a compact summary of property names, types, and allowed values. ' +
    'Set summary=false for full details. ' +
    'Call this before createOidcApp or updateOidcApp to understand available fields.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm'),
    summary: z
      .boolean()
      .default(true)
      .describe(
        'When true (default), returns a compact listing of property names, types, and allowed values. ' +
          'Set to false for the full schema.'
      ),
    sections: z
      .array(z.string())
      .optional()
      .describe(
        'Limits the full client configuration schema to specific sections ' +
          '(e.g., ["coreOAuth2ClientConfig", "advancedOAuth2ClientConfig"]). ' +
          'The application metadata schema is always returned in full. Omit to get all sections.'
      ),
    includeDefaults: z
      .boolean()
      .default(false)
      .describe('Returns default values for all fields. Only applies when summary is false. Large response.')
  },
  async toolFunction({
    realm,
    summary = true,
    sections,
    includeDefaults = false
  }: {
    realm: (typeof REALMS)[number];
    summary?: boolean;
    sections?: string[];
    includeDefaults?: boolean;
  }) {
    try {
      const oauth2ClientBasePath = `realm-config/agents/OAuth2Client`;

      // Fetch AM schema (always) and template (only when full mode with includeDefaults)
      const amSchemaUrl = `${buildAMRealmUrl(realm, oauth2ClientBasePath)}?_action=schema`;
      const amSchemaPromise = makeAuthenticatedRequest(amSchemaUrl, SCOPES, {
        method: 'POST',
        headers: AM_OAUTH2_CLIENT_HEADERS,
        body: JSON.stringify({})
      });

      let amTemplatePromise: Promise<{ data: unknown; response: Response }> | null = null;
      if (!summary && includeDefaults) {
        const amTemplateUrl = `${buildAMRealmUrl(realm, oauth2ClientBasePath)}?_action=template`;
        amTemplatePromise = makeAuthenticatedRequest(amTemplateUrl, SCOPES, {
          method: 'POST',
          headers: AM_OAUTH2_CLIENT_HEADERS,
          body: JSON.stringify({})
        });
      }

      // Fetch IDM managed application schema
      const idmConfigUrl = `https://${aicBaseUrl}/openidm/config/managed`;
      const idmConfigPromise = makeAuthenticatedRequest(idmConfigUrl, SCOPES, {
        method: 'GET'
      });

      // Await all in parallel
      const [amSchemaResult, idmConfigResult, amTemplateResult] = await Promise.all([
        amSchemaPromise,
        idmConfigPromise,
        amTemplatePromise
      ]);

      // Extract IDM application schema for the realm
      const managedConfig = idmConfigResult.data as { objects: Array<{ name: string; schema: any }> };
      const appObjectDef = managedConfig.objects?.find((obj) => obj.name === `${realm}_application`);

      // Build IDM schema output, omitting ssoEntities to prevent agents from setting it directly
      let idmSchema: Record<string, any> | null = null;
      if (appObjectDef?.schema) {
        const { properties, required } = appObjectDef.schema;
        const filteredProperties = { ...properties };
        delete filteredProperties.ssoEntities;

        if (summary) {
          idmSchema = summarizeIdmSchema(filteredProperties, required || []);
        } else {
          idmSchema = { properties: filteredProperties, required };
        }
      }

      // Build AM schema output
      let amSchema: any = amSchemaResult.data;
      if (summary) {
        amSchema = summarizeAmSchema(amSchema as Record<string, any>);
      } else if (sections && sections.length > 0) {
        const fullSchema = structuredClone(amSchema as Record<string, any>);
        fullSchema.properties = Object.fromEntries(
          Object.entries(fullSchema.properties || {}).filter(([key]) => sections.includes(key))
        );
        amSchema = fullSchema;
      }

      // Build combined result
      const result: Record<string, any> = {
        oauth2Client: {
          schema: amSchema,
          ...(amTemplateResult && { template: amTemplateResult.data })
        },
        managedApplication: {
          schema: idmSchema,
          required: ['name', 'owners']
        }
      };

      return createToolResponse(formatSuccess(result, amSchemaResult.response));
    } catch (error: any) {
      return createToolResponse(`Failed to get OIDC app schema: ${error.message}`);
    }
  }
};
