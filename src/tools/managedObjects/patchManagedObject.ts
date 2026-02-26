// src/tools/patchManagedObject.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { EXAMPLE_TYPES_STRING } from '../../utils/managedObjectHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

// JSON Patch operation schema
const patchOperationSchema = z.object({
  operation: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']).describe('The patch operation type'),
  field: z
    .string()
    .describe(
      "The field path to modify using JSON Pointer format (e.g., '/fieldName'). Call getManagedObjectSchema to discover available fields."
    ),
  value: z.any().optional().describe('The value for the operation (required for add/replace/test operations)')
});

export const patchManagedObjectTool = {
  name: 'patchManagedObject',
  title: 'Patch Managed Object',
  description: 'Update specific fields of a managed object in PingOne AIC using JSON Patch operations',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    objectType: z
      .string()
      .min(1)
      .describe(
        `Managed object type (e.g., ${EXAMPLE_TYPES_STRING}). Use listManagedObjects to discover all available types.`
      ),
    objectId: safePathSegmentSchema.describe("The object's unique identifier (_id)"),
    revision: z
      .string()
      .min(1)
      .refine((val) => val.trim().length > 0, {
        message: 'Revision cannot be empty or whitespace'
      })
      .describe('The current revision (_rev) of the object, obtained from getManagedObject'),
    operations: z.array(patchOperationSchema).describe('Array of JSON Patch operations to apply to the object')
  },
  async toolFunction({
    objectType,
    objectId,
    revision,
    operations
  }: {
    objectType: string;
    objectId: string;
    revision: string;
    operations: Array<{ operation: string; field: string; value?: any }>;
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
      const successMessage = `Patched managed object ${objectId}. New revision: ${patchedObject._rev}`;

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Failed to patch managed object: ${error.message}`);
    }
  }
};
