// src/tools/getManagedObject.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { SUPPORTED_OBJECT_TYPES, objectIdSchema } from '../../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const getManagedObjectTool = {
  name: 'getManagedObject',
  title: 'Get Managed Object',
  description: 'Retrieve a managed object\'s complete profile by ID in PingOne AIC',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.enum(SUPPORTED_OBJECT_TYPES).describe('Managed object type'),
    objectId: objectIdSchema.describe('The object\'s unique identifier (_id)'),
  },
  async toolFunction({ objectType, objectId }: { objectType: string; objectId: string }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}/${objectId}`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Failed to retrieve managed object: ${error.message}`);
    }
  }
};
