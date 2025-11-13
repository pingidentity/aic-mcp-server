// src/tools/createUser.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';

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
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        body: JSON.stringify(userData)
      });

      const createdUser = data as any;
      const successMessage = `User created successfully with _id: ${createdUser._id}`;

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Error creating user: ${error.message}`);
    }
  }
};
