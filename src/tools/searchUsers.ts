// src/tools/getUsers.ts
import { z } from 'zod';
import { authService } from '../services/authService.js';

// This will be loaded from environment variables in the main server file
const aicBaseUrl = process.env.AIC_BASE_URL;

export const searchUsersTool = {
  name: 'searchUsers',
  title: 'Search Users',
  description: "Search for users in a specified realm of a PingOne AIC environment using a query term that matches userName, givenName, sn, or mail.",
  inputSchema: {
    realm: z.string().describe("The realm the users are related to, either 'alpha' or 'bravo;."),
    queryTerm: z.string().describe("The search term to query against user fields (userName, givenName, sn, mail)."),
  },
  async toolFunction({ realm, queryTerm }: { realm: string; queryTerm: string; }) {

    // Construct the query filter to search across multiple fields that might match the query term.
    // We match if any of the fields userName, givenName, sn, or mail starts with the query term.
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
      return {
        content: [{
          type: 'text' as const,
          text: `Error processing your request: ${error.message}`
        }]
      };
    }
  }
};