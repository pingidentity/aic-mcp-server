// src/tools/patchUser.ts
import { z } from 'zod';
import { authService } from '../services/authService.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

// JSON Patch operation schema
const patchOperationSchema = z.object({
  operation: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']).describe("The patch operation type"),
  field: z.string().describe("The field path to modify (e.g., '/sn', '/givenName', '/mail')"),
  value: z.any().optional().describe("The value for the operation (required for add/replace/test operations)")
});

export const patchUserTool = {
  name: 'patchUser',
  title: 'Patch User',
  description: 'Update specific fields of a user in PingOne AIC using JSON Patch operations. IMPORTANT: You must first retrieve the user with getUser to obtain the current _rev (revision) value and verify the current state before making changes. The revision ensures you are updating from a known state and prevents conflicting updates.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.string().describe("The managed object type (e.g., 'alpha_user', 'bravo_user')"),
    userId: z.string().describe("The unique identifier (_id) of the user to patch"),
    revision: z.string().describe("The current revision (_rev) of the user, obtained from getUser. This ensures the patch is applied to the expected version of the user."),
    operations: z.array(patchOperationSchema).describe("Array of JSON Patch operations to apply to the user")
  },
  async toolFunction({ objectType, userId, revision, operations }: {
    objectType: string;
    userId: string;
    revision: string;
    operations: Array<{operation: string; field: string; value?: any}>
  }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}/${userId}`;

    try {
      const token = await authService.getToken(SCOPES);

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'If-Match': revision
        },
        body: JSON.stringify(operations)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const transactionId = response.headers.get('x-forgerock-transactionid');
        const errorMessage = `Failed to patch user: ${response.status} ${response.statusText} - ${errorBody}`;
        const transactionInfo = transactionId ? `\n\nTransaction ID: ${transactionId}` : '';
        throw new Error(errorMessage + transactionInfo);
      }

      const patchedUser = await response.json();
      const transactionId = response.headers.get('x-forgerock-transactionid');

      // Return confirmation with updated _rev
      const successMessage = `User with _id '${userId}' successfully patched. New revision: ${patchedUser._rev}`;
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
          text: `Error patching user: ${error.message}`
        }]
      };
    }
  }
};
