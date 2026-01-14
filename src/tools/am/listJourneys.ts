import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_API_HEADERS } from '../../utils/amHelpers.js';

// Define scopes as a constant so they can be referenced in both the tool definition and function
const SCOPES = ['fr:am:*'];

export const listJourneysTool = {
  name: 'listJourneys',
  title: 'List AM Journeys',
  description: 'Retrieve all authentication journeys (trees) for a specific realm in PingOne AIC. Returns journey metadata including ID, description, identity resource, UI configuration, nodes, enabled status, mustRun flag, and session time settings.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query'),
  },
  async toolFunction({ realm }: { realm: string }) {
    try {
      const url = new URL(`${buildAMRealmUrl(realm, 'realm-config/authentication/authenticationtrees/trees')}`);

      // Build query parameters - always return the standard set of fields
      url.searchParams.append('_queryFilter', 'true');
      url.searchParams.append('_pageSize', '-1'); // Return all results
      url.searchParams.append('_fields', '_id,description,identityResource,uiConfig,nodes,enabled,mustRun,maximumSessionTime,maximumIdleTime');

      const { data, response } = await makeAuthenticatedRequest(url.toString(), SCOPES, {
        method: 'GET',
        headers: AM_API_HEADERS,
      });

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to list journeys in realm "${realm}": ${error.message}`);
    }
  },
};
