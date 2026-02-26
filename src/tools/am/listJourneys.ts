import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_API_HEADERS } from '../../utils/amHelpers.js';

// Define scopes as a constant so they can be referenced in both the tool definition and function
const SCOPES = ['fr:am:*'];

// Headers for the authentication config endpoint (different API version)
const AUTH_CONFIG_HEADERS = {
  'Content-Type': 'application/json',
  'Accept-API-Version': 'protocol=1.0,resource=1.0'
};

export const listJourneysTool = {
  name: 'listJourneys',
  title: 'List AM Journeys',
  description:
    'Retrieve all authentication journeys (trees) for a specific realm in PingOne AIC. Returns journey metadata including ID, description, and the default journey for the realm.',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to query')
  },
  async toolFunction({ realm }: { realm: string }) {
    try {
      const journeysUrl = new URL(`${buildAMRealmUrl(realm, 'realm-config/authentication/authenticationtrees/trees')}`);
      journeysUrl.searchParams.append('_queryFilter', 'true');
      journeysUrl.searchParams.append('_pageSize', '-1');
      journeysUrl.searchParams.append(
        '_fields',
        '_id,description,identityResource,uiConfig,nodes,enabled,mustRun,maximumSessionTime,maximumIdleTime'
      );

      const authConfigUrl = buildAMRealmUrl(realm, 'realm-config/authentication');

      // Fetch journeys and auth config in parallel
      const [journeysResult, authConfigResult] = await Promise.all([
        makeAuthenticatedRequest(journeysUrl.toString(), SCOPES, {
          method: 'GET',
          headers: AM_API_HEADERS
        }),
        makeAuthenticatedRequest(authConfigUrl, SCOPES, {
          method: 'GET',
          headers: AUTH_CONFIG_HEADERS
        })
      ]);

      const journeysData = journeysResult.data as any;
      const authConfigData = authConfigResult.data as any;
      const defaultJourney = authConfigData?.core?.orgConfig || null;

      const result = {
        ...journeysData,
        defaultJourney
      };

      return createToolResponse(formatSuccess(result, journeysResult.response));
    } catch (error: any) {
      return createToolResponse(`Failed to list journeys in realm "${realm}": ${error.message}`);
    }
  }
};
