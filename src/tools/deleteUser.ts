// src/tools/deleteUser.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';

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
      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE'
      });

      const successMessage = `User with _id '${userId}' successfully deleted from ${objectType}`;
      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Error deleting user: ${error.message}`);
    }
  }
};
