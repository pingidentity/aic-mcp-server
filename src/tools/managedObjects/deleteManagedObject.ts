// src/tools/deleteManagedObject.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { SUPPORTED_OBJECT_TYPES, objectIdSchema } from '../../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const deleteManagedObjectTool = {
  name: 'deleteManagedObject',
  title: 'Delete Managed Object',
  description: 'Delete a managed object by ID from PingOne AIC',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.enum(SUPPORTED_OBJECT_TYPES).describe('Managed object type'),
    objectId: objectIdSchema.describe('The object\'s unique identifier (_id)'),
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
