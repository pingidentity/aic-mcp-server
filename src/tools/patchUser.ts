// src/tools/patchUser.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';

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
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PATCH',
        headers: {
          'If-Match': revision
        },
        body: JSON.stringify(operations)
      });

      const patchedUser = data as any;
      const successMessage = `User with _id '${userId}' successfully patched. New revision: ${patchedUser._rev}`;

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Error patching user: ${error.message}`);
    }
  }
};
