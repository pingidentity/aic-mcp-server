import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { REALMS, safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const getThemeTool = {
  name: 'getTheme',
  title: 'Get Theme',
  description: 'Retrieve a specific theme by ID or name from PingOne AIC',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    realm: z.enum(REALMS).describe('Realm name'),
    themeIdentifier: safePathSegmentSchema.describe('Theme ID or name')
  },
  async toolFunction({ realm, themeIdentifier }: { realm: string; themeIdentifier: string }) {
    try {
      const queryFilter = `_id eq "${themeIdentifier}" or name eq "${themeIdentifier}"`;
      const url = `https://${aicBaseUrl}/openidm/ui/theme/?realm=${encodeURIComponent(realm)}&_queryFilter=${encodeURIComponent(queryFilter)}`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);

      const resultCount = (data as any)?.resultCount || 0;
      const results = (data as any)?.result || [];

      if (resultCount === 0) {
        return createToolResponse(`Theme not found: "${themeIdentifier}" in realm "${realm}"`);
      }

      if (resultCount > 1) {
        return createToolResponse(
          `Multiple themes found matching "${themeIdentifier}" in realm "${realm}". This should not happen - please report this issue.`
        );
      }

      return createToolResponse(formatSuccess(results[0], response));
    } catch (error: any) {
      return createToolResponse(
        `Failed to retrieve theme "${themeIdentifier}" from realm "${realm}": ${error.message}`
      );
    }
  }
};
