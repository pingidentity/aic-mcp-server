// src/tools/queryManagedObjects.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { SUPPORTED_OBJECT_TYPES, getBaseType } from '../../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

/**
 * Configuration mapping base object types to their queryable fields
 * This determines which fields are queried with the 'sw' (starts with) operator
 */
const QUERY_FIELD_CONFIG: Record<string, string[]> = {
  user: ['userName', 'givenName', 'sn', 'mail'],
  role: ['name', 'description'],
  group: ['name', 'description'],
  organization: ['name', 'description'],
};

/**
 * Configuration mapping base object types to the fields returned in query results
 */
const RETURN_FIELD_CONFIG: Record<string, string[]> = {
  user: ['userName', 'givenName', 'sn', 'mail'],
  role: ['name', 'description'],
  group: ['name', 'description'],
  organization: ['name', 'description'],
};

export const queryManagedObjectsTool = {
  name: 'queryManagedObjects',
  title: 'Query Managed Objects',
  description: 'Query managed objects in PingOne AIC by search term',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.enum(SUPPORTED_OBJECT_TYPES).describe('Managed object type'),
    queryTerm: z.string().min(3).describe(
      "Query term to match against the object's queryable fields (minimum 3 characters)"
    ),
  },
  async toolFunction({ objectType, queryTerm }: { objectType: string; queryTerm: string }) {
    // Extract base type to determine query and return fields
    const baseType = getBaseType(objectType);
    const queryFields = QUERY_FIELD_CONFIG[baseType];
    const returnFields = RETURN_FIELD_CONFIG[baseType];

    // Build query filter: field1 sw "term" OR field2 sw "term" OR ...
    const queryFilter = queryFields
      .map(field => `${field} sw "${queryTerm}"`)
      .join(' OR ');

    const encodedQueryFilter = encodeURIComponent(queryFilter);
    const fieldsParam = returnFields.join(',');

    // Use first query field for sorting
    const sortField = queryFields[0];

    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}?_queryFilter=${encodedQueryFilter}&_pageSize=10&_totalPagedResultsPolicy=EXACT&_sortKeys=${sortField}&_fields=${fieldsParam}`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to query ${objectType}: ${error.message}`);
    }
  }
};
