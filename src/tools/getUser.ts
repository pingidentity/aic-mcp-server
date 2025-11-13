// src/tools/getUser.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';

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
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Error retrieving user: ${error.message}`);
    }
  }
};
