// src/tools/patchManagedObject.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { SUPPORTED_OBJECT_TYPES, objectIdSchema } from '../../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

// JSON Patch operation schema
const patchOperationSchema = z.object({
  operation: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']).describe("The patch operation type"),
  field: z.string().describe("The field path to modify (e.g., '/name', '/description', '/mail')"),
  value: z.any().optional().describe("The value for the operation (required for add/replace/test operations)")
});

export const patchManagedObjectTool = {
  name: 'patchManagedObject',
  title: 'Patch Managed Object',
  description: 'Update specific fields of a managed object in PingOne AIC using JSON Patch operations. Supported types: alpha_user, bravo_user, alpha_role, bravo_role, alpha_group, bravo_group, alpha_organization, bravo_organization. IMPORTANT: You must first retrieve the object with getManagedObject to obtain the current _rev (revision) value and verify the current state before making changes. The revision ensures you are updating from a known state and prevents conflicting updates.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.enum(SUPPORTED_OBJECT_TYPES).describe("The managed object type (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')"),
    objectId: objectIdSchema.describe("The unique identifier (_id) of the object to patch"),
    revision: z.string().describe("The current revision (_rev) of the object, obtained from getManagedObject. This ensures the patch is applied to the expected version of the object."),
    operations: z.array(patchOperationSchema).describe("Array of JSON Patch operations to apply to the object")
  },
  async toolFunction({ objectType, objectId, revision, operations }: {
    objectType: string;
    objectId: string;
    revision: string;
    operations: Array<{operation: string; field: string; value?: any}>
  }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}/${objectId}`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PATCH',
        headers: {
          'If-Match': revision
        },
        body: JSON.stringify(operations)
      });

      const patchedObject = data as any;
      const successMessage = `Managed object with _id '${objectId}' successfully patched. New revision: ${patchedObject._rev}`;

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Error patching managed object: ${error.message}`);
    }
  }
};
