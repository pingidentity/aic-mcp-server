// src/tools/createUser.ts
import { z } from 'zod';
import { getAuthService } from '../services/authService.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const createUserTool = {
  name: 'createUser',
  title: 'Create User',
  description: 'Create a new user in a specified realm (alpha or bravo) of PingOne AIC. Provide the managed object type (e.g., alpha_user, bravo_user) and user data as a JSON object containing required and optional properties. Use getManagedObjectSchema first to determine required fields. Returns only the created user\'s _id to minimize context.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.string().describe("The managed object type to create (e.g., 'alpha_user', 'bravo_user')"),
    userData: z.record(z.any()).describe("JSON object containing user properties (must include all required fields from the schema)"),
  },
  async toolFunction({ objectType, userData }: { objectType: string; userData: Record<string, any> }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}?_action=create`;

    try {
      const token = await getAuthService().getToken(SCOPES);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const transactionId = response.headers.get('x-forgerock-transactionid');
        const errorMessage = `Failed to create user: ${response.status} ${response.statusText} - ${errorBody}`;
        const transactionInfo = transactionId ? `\n\nTransaction ID: ${transactionId}` : '';
        throw new Error(errorMessage + transactionInfo);
      }

      const createdUser = await response.json();
      const transactionId = response.headers.get('x-forgerock-transactionid');

      // Return only the _id to minimize context
      const successMessage = `User created successfully with _id: ${createdUser._id}`;
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
          text: `Error creating user: ${error.message}`
        }]
      };
    }
  }
};
