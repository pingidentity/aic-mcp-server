import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS } from '../../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const getThemeTool = {
  name: 'getTheme',
  title: 'Get Theme',
  description: 'Retrieve a specific theme by its ID or name from PingOne AIC. Returns the complete theme configuration including all styling properties, logos, headers, footers, and page settings.',
  scopes: SCOPES,
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm containing the theme (e.g., "alpha", "bravo")'),
    themeIdentifier: z.string().describe('The theme ID or name to retrieve')
  },
  async toolFunction({ realm, themeIdentifier }: { realm: string; themeIdentifier: string }) {
    try {
      const queryFilter = `_id eq "${themeIdentifier}" or name eq "${themeIdentifier}"`;
      const url = `https://${aicBaseUrl}/openidm/ui/theme/?realm=${encodeURIComponent(realm)}&_queryFilter=${encodeURIComponent(queryFilter)}`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);

      const resultCount = (data as any)?.resultCount || 0;
      const results = (data as any)?.result || [];

      if (resultCount === 0) {
        return createToolResponse(`Error: No theme found with ID or name "${themeIdentifier}" in realm "${realm}"`);
      }

      if (resultCount > 1) {
        return createToolResponse(`Error: Multiple themes found matching "${themeIdentifier}" in realm "${realm}". This should not happen - please report this issue.`);
      }

      return createToolResponse(formatSuccess(results[0], response));
    } catch (error: any) {
      return createToolResponse(`Error retrieving theme "${themeIdentifier}" from realm "${realm}": ${error.message}`);
    }
  }
};
