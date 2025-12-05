import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idc:esv:read'];

export const queryESVsTool = {
  name: 'queryESVs',
  title: 'Query Environment Secrets and Variables (ESVs)',
  description: 'Query environment secrets or variables (ESVs) in PingOne AIC by ID',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    type: z.enum(['variable', 'secret']).describe('Type of ESV to query'),
    queryTerm: z.string().max(100).optional().describe(
      'Search term to filter by ID. If omitted, returns all ESVs up to pageSize'
    ),
    pageSize: z.number().int().min(1).max(100).optional().describe(
      'Number of results to return per page (default: 50)'
    ),
    pagedResultsCookie: z.string().optional().describe(
      'Pagination cookie from previous response to retrieve next page'
    ),
    sortKeys: z.string().max(200).optional().describe(
      'Comma-separated field names to sort by. Prefix with "-" for descending. Example: "_id,-lastChangeDate"'
    ),
  },
  async toolFunction({
    type,
    queryTerm,
    pageSize,
    pagedResultsCookie,
    sortKeys
  }: {
    type: 'variable' | 'secret';
    queryTerm?: string;
    pageSize?: number;
    pagedResultsCookie?: string;
    sortKeys?: string;
  }) {
    try {
      const endpoint = type === 'variable' ? 'variables' : 'secrets';
      const url = new URL(`https://${aicBaseUrl}/environment/${endpoint}`);

      if (queryTerm) {
        // Escape double quotes to prevent query injection
        const escapedTerm = queryTerm.replace(/"/g, '\\"');
        const queryFilter = `/_id co "${escapedTerm}"`;
        url.searchParams.append('_queryFilter', queryFilter);
      } else {
        url.searchParams.append('_queryFilter', 'true');
      }

      // Page size - default to 50, max 100
      const effectivePageSize = Math.min(pageSize || 50, 100);
      url.searchParams.append('_pageSize', effectivePageSize.toString());

      if (pagedResultsCookie) {
        url.searchParams.append('_pagedResultsCookie', pagedResultsCookie);
      }

      if (sortKeys) {
        url.searchParams.append('_sortKeys', sortKeys);
      }

      const { data, response } = await makeAuthenticatedRequest(
        url.toString(),
        SCOPES,
        {
          headers: {
            'accept-api-version': 'resource=2.0'
          }
        }
      );

      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to query environment ${type}s: ${error.message}`);
    }
  }
};
