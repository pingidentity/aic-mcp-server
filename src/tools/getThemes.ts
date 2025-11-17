import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';
import { REALMS } from '../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const getThemesTool = {
  name: 'getThemes',
  title: 'Get Themes',
  description: 'Retrieve all themes for a specific realm in PingOne AIC. Returns theme names and default status. Use this to discover available themes before getting theme details or making updates.',
  scopes: SCOPES,
  inputSchema: {
    realm: z.enum(REALMS).describe('The realm to get themes for (e.g., "alpha", "bravo")')
  },
  async toolFunction({ realm }: { realm: string }) {
    try {
      const fields = 'name,isDefault';
      const url = `https://${aicBaseUrl}/openidm/ui/theme/?realm=${encodeURIComponent(realm)}&_queryFilter=true&_fields=${encodeURIComponent(fields)}`;

      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);

      const themeCount = (data as any)?.result?.length || 0;
      const resultText = `Found ${themeCount} theme(s) for realm "${realm}":\n\n${JSON.stringify(data, null, 2)}`;

      return createToolResponse(formatSuccess(resultText, response));
    } catch (error: any) {
      return createToolResponse(`Error retrieving themes for realm "${realm}": ${error.message}`);
    }
  }
};
