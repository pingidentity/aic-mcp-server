import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';
import { buildAMRealmUrl, AM_API_HEADERS, categorizeError } from '../../utils/amHelpers.js';

const SCOPES = ['fr:am:*'];

export const deleteJourneyTool = {
  name: 'deleteJourney',
  title: 'Delete Journey',
  description:
    'Delete an authentication journey from a realm. AM automatically cleans up all node instances within the journey, including PageNode child nodes.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the journey'),
    journeyName: safePathSegmentSchema.describe('The name of the journey to delete')
  },
  async toolFunction({ realm, journeyName }: { realm: string; journeyName: string }) {
    try {
      const encodedJourneyName = encodeURIComponent(journeyName);
      const url = buildAMRealmUrl(realm, `realm-config/authentication/authenticationtrees/trees/${encodedJourneyName}`);

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE',
        headers: AM_API_HEADERS
      });

      const result = {
        success: true,
        journeyName,
        message: 'Journey and all associated nodes deleted successfully.'
      };

      return createToolResponse(formatSuccess(result, response));
    } catch (error: any) {
      const category = categorizeError(error.message);
      return createToolResponse(`Failed to delete journey "${journeyName}" [${category}]: ${error.message}`);
    }
  }
};
