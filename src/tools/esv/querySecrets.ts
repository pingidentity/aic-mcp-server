import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:read'];

export const querySecretsTool = {
  name: 'querySecrets',
  title: 'Query Environment Secrets (ESVs)',
  description: 'Query environment secrets (ESVs) in PingOne AIC by ID',
  scopes: SCOPES,
  inputSchema: {
    queryTerm: z.string().describe('Search term to filter secrets by ID'),
  },
  async toolFunction({ queryTerm }: { queryTerm: string }) {
    try {
      // Build query filter: /_id co "term"
      const queryFilter = `/_id co "${queryTerm}"`;

      const encodedQueryFilter = encodeURIComponent(queryFilter);

      const url = `https://${aicBaseUrl}/environment/secrets?_queryFilter=${encodedQueryFilter}&_pagedResultsOffset=0&_pageSize=50&_sortKeys=_id`;

      const { data, response } = await makeAuthenticatedRequest(
        url,
        SCOPES,
        {
          headers: {
            'accept-api-version': 'resource=2.0'
          }
        }
      );

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to query environment secrets: ${error.message}`);
    }
  }
};
