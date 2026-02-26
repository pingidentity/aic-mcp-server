import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, categorizeError } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

// Headers for the authentication config endpoint
const AUTH_CONFIG_HEADERS = {
  'Content-Type': 'application/json',
  'Accept-API-Version': 'protocol=1.0,resource=1.0'
};

export const setDefaultJourneyTool = {
  name: 'setDefaultJourney',
  title: 'Set Default Journey',
  description:
    'Set the default authentication journey for a realm. This journey will be used when no specific journey is requested during authentication.',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to configure'),
    journeyName: safePathSegmentSchema.describe('The name of the journey to set as default')
  },
  async toolFunction({ realm, journeyName }: { realm: string; journeyName: string }) {
    try {
      const authConfigUrl = buildAMRealmUrl(realm, 'realm-config/authentication');

      // First, GET the current config to preserve adminAuthModule
      const { data: currentConfig } = await makeAuthenticatedRequest(authConfigUrl, SCOPES, {
        method: 'GET',
        headers: AUTH_CONFIG_HEADERS
      });

      const configData = currentConfig as any;
      const adminAuthModule = configData?.core?.adminAuthModule || 'Login';

      // PUT the updated config
      const { response } = await makeAuthenticatedRequest(authConfigUrl, SCOPES, {
        method: 'PUT',
        headers: AUTH_CONFIG_HEADERS,
        body: JSON.stringify({
          orgConfig: journeyName,
          adminAuthModule: adminAuthModule
        })
      });

      const result = {
        success: true,
        realm,
        defaultJourney: journeyName,
        message: `Default journey for realm "${realm}" set to "${journeyName}"`
      };

      return createToolResponse(formatSuccess(result, response));
    } catch (error: any) {
      const category = categorizeError(error.message);
      return createToolResponse(`Failed to set default journey [${category}]: ${error.message}`);
    }
  }
};
