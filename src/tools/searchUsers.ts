// src/tools/searchUsers.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const searchUsersTool = {
  name: 'searchUsers',
  title: 'Search Users',
  description: "Search for users in a specified realm of a PingOne AIC environment using a query term that matches userName, givenName, sn, or mail.",
  scopes: SCOPES,
  inputSchema: {
    realm: z.enum(['alpha', 'bravo']).describe("The realm the users are related to, either 'alpha' or 'bravo'."),
    queryTerm: z.string().describe("The search term to query against user fields (userName, givenName, sn, mail)."),
  },
  async toolFunction({ realm, queryTerm }: { realm: string; queryTerm: string; }) {
    // Construct the query filter to search across multiple fields that might match the query term.
    // We match if any of the fields userName, givenName, sn, or mail starts with the query term.
    const queryFilter = `userName sw "${queryTerm}" OR givenName sw "${queryTerm}" OR sn sw "${queryTerm}" OR mail sw "${queryTerm}"`;
    const encodedQueryFilter = encodeURIComponent(queryFilter);

    const url = `https://${aicBaseUrl}/openidm/managed/${realm}_user?_queryFilter=${encodedQueryFilter}&_pageSize=10&_totalPagedResultsPolicy=EXACT&_sortKeys=userName&_fields=userName,givenName,sn,mail`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Error searching users: ${error.message}`);
    }
  }
};