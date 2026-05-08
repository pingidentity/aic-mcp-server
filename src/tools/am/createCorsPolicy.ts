import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMGlobalConfigUrl, AM_CORS_HEADERS } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const createCorsPolicyTool = {
  name: 'createCorsPolicy',
  title: 'Create CORS Policy',
  description:
    'Create a new CORS policy on the global AM CorsService. All seven policy fields are required. A user-facing policyId may optionally be supplied; if omitted, AM assigns one. The policy ID is returned in the success response.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    openWorldHint: true
  },
  inputSchema: {
    policyId: safePathSegmentSchema
      .optional()
      .describe('Optional user-facing identifier for the CORS policy. If omitted, AM assigns one.'),
    acceptedOrigins: z.array(z.string()).describe('Allowed origins (e.g. ["https://example.org"])'),
    acceptedMethods: z.array(z.string()).describe('HTTP methods allowed during preflight'),
    acceptedHeaders: z.array(z.string()).describe('Non-simple request headers allowed during preflight'),
    exposedHeaders: z.array(z.string()).describe('Response headers exposed to the browser'),
    maxAge: z.number().int().nonnegative().describe('Preflight cache duration in seconds'),
    allowCredentials: z.boolean().describe('Whether to send Access-Control-Allow-Credentials: true on responses'),
    enabled: z.boolean().describe('Whether the policy is enabled; if false, no CORS headers are added')
  },
  async toolFunction({
    policyId,
    acceptedOrigins,
    acceptedMethods,
    acceptedHeaders,
    exposedHeaders,
    maxAge,
    allowCredentials,
    enabled
  }: {
    policyId?: string;
    acceptedOrigins: string[];
    acceptedMethods: string[];
    acceptedHeaders: string[];
    exposedHeaders: string[];
    maxAge: number;
    allowCredentials: boolean;
    enabled: boolean;
  }) {
    try {
      const url = `${buildAMGlobalConfigUrl('CorsService')}?_action=create`;

      const payload: Record<string, unknown> = {
        acceptedOrigins,
        acceptedMethods,
        acceptedHeaders,
        exposedHeaders,
        maxAge,
        allowCredentials,
        enabled
      };
      if (policyId !== undefined) {
        payload._id = policyId;
      }

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        headers: AM_CORS_HEADERS,
        body: JSON.stringify(payload)
      });

      const policyData = data as { _id: string };
      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `CORS policy created successfully.\n` + `Policy ID: ${policyData._id}\n` + `Transaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(`Failed to create CORS policy: ${error.message}`);
    }
  }
};
