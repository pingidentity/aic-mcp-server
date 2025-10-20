// src/tools/createUser.ts
import { z } from 'zod';
import { authService } from '../services/authService.js';

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
      const token = await authService.getToken(SCOPES);

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
        throw new Error(`Failed to create user: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const createdUser = await response.json();

      // Return only the _id to minimize context
      return {
        content: [{
          type: 'text' as const,
          text: `User created successfully with _id: ${createdUser._id}`
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
