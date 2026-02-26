// src/tools/deleteManagedObject.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { EXAMPLE_TYPES_STRING } from '../../utils/managedObjectHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const deleteManagedObjectTool = {
  name: 'deleteManagedObject',
  title: 'Delete Managed Object',
  description: 'Delete a managed object by ID from PingOne AIC',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    objectType: z
      .string()
      .min(1)
      .describe(
        `Managed object type (e.g., ${EXAMPLE_TYPES_STRING}). Use listManagedObjects to discover all available types.`
      ),
    objectId: safePathSegmentSchema.describe("The object's unique identifier (_id)")
  },
  async toolFunction({ objectType, objectId }: { objectType: string; objectId: string }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}/${objectId}`;

    try {
      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'DELETE'
      });

      const successMessage = `Deleted managed object ${objectId} from ${objectType}`;
      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Failed to delete managed object: ${error.message}`);
    }
  }
};
