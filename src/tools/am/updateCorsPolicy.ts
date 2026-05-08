import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMGlobalConfigUrl, AM_CORS_HEADERS } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const updateCorsPolicyTool = {
  name: 'updateCorsPolicy',
  title: 'Update CORS Policy',
  description:
    'Update an existing CORS policy by ID on the global AM CorsService. Performs a full replacement on the wire (fetch-then-PUT): the current policy is fetched first, any provided fields are merged over it, and the complete policy is PUT back to AM. Fields not supplied are preserved from the existing policy.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  },
  inputSchema: {
    policyId: safePathSegmentSchema.describe('The unique identifier of the CORS policy to update'),
    acceptedOrigins: z.array(z.string()).optional().describe('New allowed origins'),
    acceptedMethods: z.array(z.string()).optional().describe('New HTTP methods allowed during preflight'),
    acceptedHeaders: z.array(z.string()).optional().describe('New non-simple request headers allowed during preflight'),
    exposedHeaders: z.array(z.string()).optional().describe('New response headers exposed to the browser'),
    maxAge: z.number().int().nonnegative().optional().describe('New preflight cache duration in seconds'),
    allowCredentials: z
      .boolean()
      .optional()
      .describe('Whether to send Access-Control-Allow-Credentials: true on responses'),
    enabled: z.boolean().optional().describe('Whether the policy is enabled')
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
    policyId: string;
    acceptedOrigins?: string[];
    acceptedMethods?: string[];
    acceptedHeaders?: string[];
    exposedHeaders?: string[];
    maxAge?: number;
    allowCredentials?: boolean;
    enabled?: boolean;
  }) {
    try {
      if (
        acceptedOrigins === undefined &&
        acceptedMethods === undefined &&
        acceptedHeaders === undefined &&
        exposedHeaders === undefined &&
        maxAge === undefined &&
        allowCredentials === undefined &&
        enabled === undefined
      ) {
        return createToolResponse(
          'No updates provided. Specify at least one of: acceptedOrigins, acceptedMethods, acceptedHeaders, exposedHeaders, maxAge, allowCredentials, enabled'
        );
      }

      const url = buildAMGlobalConfigUrl('CorsService', encodeURIComponent(policyId));

      // Fetch current policy
      const { data: fetchedPolicy } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'GET',
        headers: AM_CORS_HEADERS
      });
      const currentPolicy = fetchedPolicy as Record<string, unknown>;

      // Build the PUT body from only the seven allowed attributes; AM rejects
      // requests that include metadata fields like _id, _rev, or _type.
      const updatedPolicy: Record<string, unknown> = {
        acceptedOrigins: acceptedOrigins ?? currentPolicy.acceptedOrigins,
        acceptedMethods: acceptedMethods ?? currentPolicy.acceptedMethods,
        acceptedHeaders: acceptedHeaders ?? currentPolicy.acceptedHeaders,
        exposedHeaders: exposedHeaders ?? currentPolicy.exposedHeaders,
        maxAge: maxAge ?? currentPolicy.maxAge,
        allowCredentials: allowCredentials ?? currentPolicy.allowCredentials,
        enabled: enabled ?? currentPolicy.enabled
      };

      // PUT the updated policy
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: AM_CORS_HEADERS,
        body: JSON.stringify(updatedPolicy)
      });

      const policyData = data as { _id: string };
      const transactionId = response.headers.get('x-forgerock-transactionid') || 'unknown';

      return createToolResponse(
        `CORS policy "${policyId}" updated successfully.\n` +
          `Policy ID: ${policyData._id}\n` +
          `Transaction ID: ${transactionId}`
      );
    } catch (error: any) {
      return createToolResponse(`Failed to update CORS policy "${policyId}": ${error.message}`);
    }
  }
};
