// src/tools/queryManagedObjects.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { SUPPORTED_OBJECT_TYPES } from '../../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const queryManagedObjectsTool = {
  name: 'queryManagedObjects',
  title: 'Query Managed Objects',
  description: 'Query managed objects in PingOne AIC using CREST query filter syntax',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.enum(SUPPORTED_OBJECT_TYPES).describe('Managed object type'),
    queryFilter: z.string().max(1000).optional().describe(
      'CREST query filter expression. IMPORTANT: Call getManagedObjectSchema first to discover available fields. ' +
      'Operators: eq, co, sw, gt, ge, lt, le, pr (present), ! (NOT). Boolean: and, or. Quote strings. ' +
      'If omitted, returns all objects up to pageSize. ' +
      'Examples: FIELD eq "value" | FIELD sw "prefix" | (FIELD1 eq "a") and (FIELD2 co "b") | FIELD pr\n' +
      'Docs: https://docs.pingidentity.com/pingoneaic/latest/developer-docs/crest/query.html#crest-query-queryFilter'
    ),
    pageSize: z.number().int().min(1).max(250).optional().describe(
      'Number of objects to return per page (default: 50)'
    ),
    pagedResultsCookie: z.string().optional().describe(
      'Pagination cookie from previous response to retrieve next page'
    ),
    sortKeys: z.string().max(500).optional().describe(
      'Comma-separated field names to sort by. Prefix with "-" for descending. Example: "FIELD1,-FIELD2"'
    ),
    fields: z.string().max(500).optional().describe(
      'Comma-separated field names to return. If omitted, returns all fields. Example: "FIELD1,FIELD2,_id"'
    ),
  },
  async toolFunction({
    objectType,
    queryFilter,
    pageSize,
    pagedResultsCookie,
    sortKeys,
    fields
  }: {
    objectType: string;
    queryFilter?: string;
    pageSize?: number;
    pagedResultsCookie?: string;
    sortKeys?: string;
    fields?: string;
  }) {
    try {
      // Build query URL using URL constructor for proper encoding
      const url = new URL(`https://${aicBaseUrl}/openidm/managed/${objectType}`);

      // Query filter - default to 'true' to return all objects
      url.searchParams.append('_queryFilter', queryFilter || 'true');

      // Page size - default to 50, max 250
      const effectivePageSize = Math.min(pageSize || 50, 250);
      url.searchParams.append('_pageSize', effectivePageSize.toString());

      // Total paged results policy - always use EXACT for accurate counts
      url.searchParams.append('_totalPagedResultsPolicy', 'EXACT');

      // Pagination cookie for subsequent pages
      if (pagedResultsCookie) {
        url.searchParams.append('_pagedResultsCookie', pagedResultsCookie);
      }

      // Sort keys
      if (sortKeys) {
        url.searchParams.append('_sortKeys', sortKeys);
      }

      // Field selection
      if (fields) {
        url.searchParams.append('_fields', fields);
      }

      const { data, response } = await makeAuthenticatedRequest(url.toString(), SCOPES);
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to query ${objectType}: ${error.message}`);
    }
  }
};
