// src/tools/getUsers.ts
import { z } from 'zod';
import { authService } from '../services/authService.js';

// This will be loaded from environment variables in the main server file
const aicBaseUrl = process.env.AIC_BASE_URL;

export const getUsersTool = {
  name: 'getUsers',
  description: "Get a list of users from the IDM user API in a Ping Advanced Identity Cloud environment based on a query.",
  inputSchema: {
    realm: z.string().describe("The realm to query, for example 'alpha'."),
    queryTerm: z.string().describe("The search term to query against user fields (userName, givenName, sn, mail)."),
  },
  async execute({ realm, queryTerm }: { realm: string; queryTerm: string; }) {
    if (!aicBaseUrl) {
      throw new Error('AIC_BASE_URL environment variable is not set.');
    }

    const queryFilter = `userName sw "${queryTerm}" OR givenName sw "${queryTerm}" OR sn sw "${queryTerm}" OR mail sw "${queryTerm}"`;
    const encodedQueryFilter = encodeURIComponent(queryFilter);
    
    const url = `https://${aicBaseUrl}/openidm/managed/${realm}_user?_queryFilter=${encodedQueryFilter}&_pageSize=10&_totalPagedResultsPolicy=EXACT&_sortKeys=userName&_fields=userName,givenName,sn,mail`;

    try {
      // Wait for the asynchronous getToken method to resolve.
      const token = await authService.getToken();

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to fetch users: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const users = await response.json();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(users, null, 2)
        }]
      };
    } catch (error: any) {
      console.error(error);
      return {
        content: [{
          type: 'text' as const,
          text: `Error processing your request: ${error.message}`
        }]
      };
    }
  }
};