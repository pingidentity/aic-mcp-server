// src/tools/deleteUser.ts
import { z } from 'zod';
import { getAuthService } from '../services/authService.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const deleteUserTool = {
  name: 'deleteUser',
  title: 'Delete User',
  description: 'Delete a user by their unique identifier (_id) from a specified managed object type (e.g., alpha_user, bravo_user) in PingOne AIC. Returns confirmation of successful deletion.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.string().describe("The managed object type (e.g., 'alpha_user', 'bravo_user')"),
    userId: z.string().describe("The unique identifier (_id) of the user to delete"),
  },
  async toolFunction({ objectType, userId }: { objectType: string; userId: string }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}/${userId}`;

    try {
      const token = await getAuthService().getToken(SCOPES);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const transactionId = response.headers.get('x-forgerock-transactionid');
        const errorMessage = `Failed to delete user: ${response.status} ${response.statusText} - ${errorBody}`;
        const transactionInfo = transactionId ? `\n\nTransaction ID: ${transactionId}` : '';
        throw new Error(errorMessage + transactionInfo);
      }

      // Successfully deleted (200 response)
      const transactionId = response.headers.get('x-forgerock-transactionid');
      const successMessage = `User with _id '${userId}' successfully deleted from ${objectType}`;
      const transactionInfo = transactionId ? `\n\nTransaction ID: ${transactionId}` : '';

      return {
        content: [{
          type: 'text' as const,
          text: successMessage + transactionInfo
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error deleting user: ${error.message}`
        }]
      };
    }
  }
};
