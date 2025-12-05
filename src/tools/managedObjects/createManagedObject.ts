// src/tools/createManagedObject.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { EXAMPLE_TYPES_STRING } from '../../config/managedObjectUtils.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const createManagedObjectTool = {
  name: 'createManagedObject',
  title: 'Create Managed Object',
  description: 'Create a new managed object in PingOne AIC',
  scopes: SCOPES,
  annotations: {
    openWorldHint: true
  },
  inputSchema: {
    objectType: z.string().min(1).describe(
      `Managed object type (e.g., ${EXAMPLE_TYPES_STRING}). Use listManagedObjects to discover all available types.`
    ),
    objectData: z.record(z.any()).describe('JSON object containing object properties (must include all required fields from the schema)'),
  },
  async toolFunction({ objectType, objectData }: { objectType: string; objectData: Record<string, any> }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}?_action=create`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        body: JSON.stringify(objectData)
      });

      const createdObject = data as any;
      const successMessage = `Created managed object ${createdObject._id}`;

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Failed to create managed object: ${error.message}`);
    }
  }
};
