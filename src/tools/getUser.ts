// src/tools/getUser.ts
import { z } from 'zod';
import { authService } from '../services/authService.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const getUserTool = {
  name: 'getUser',
  title: 'Get User',
  description: 'Retrieve a user\'s complete profile by their unique identifier (_id) from a specified managed object type (e.g., alpha_user, bravo_user) in PingOne AIC. Returns the full user object.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.string().describe("The managed object type (e.g., 'alpha_user', 'bravo_user')"),
    userId: z.string().describe("The unique identifier (_id) of the user to retrieve"),
  },
  async toolFunction({ objectType, userId }: { objectType: string; userId: string }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}/${userId}`;

    try {
      const token = await authService.getToken(SCOPES);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const transactionId = response.headers.get('x-forgerock-transactionid');
        const errorMessage = `Failed to retrieve user: ${response.status} ${response.statusText} - ${errorBody}`;
        const transactionInfo = transactionId ? `\n\nTransaction ID: ${transactionId}` : '';
        throw new Error(errorMessage + transactionInfo);
      }

      const user = await response.json();
      const transactionId = response.headers.get('x-forgerock-transactionid');
      const transactionInfo = transactionId ? `\n\nTransaction ID: ${transactionId}` : '';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(user, null, 2) + transactionInfo
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error retrieving user: ${error.message}`
        }]
      };
    }
  }
};
