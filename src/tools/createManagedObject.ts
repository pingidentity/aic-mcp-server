// src/tools/createManagedObject.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';
import { SUPPORTED_OBJECT_TYPES } from '../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const createManagedObjectTool = {
  name: 'createManagedObject',
  title: 'Create Managed Object',
  description: 'Create a new managed object in PingOne AIC. Supported types: alpha_user, bravo_user, alpha_role, bravo_role, alpha_group, bravo_group, alpha_organization, bravo_organization. Provide object data as a JSON object containing required and optional properties. Use getManagedObjectSchema first to determine required fields. Returns only the created object\'s _id to minimize context.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.enum(SUPPORTED_OBJECT_TYPES).describe("The managed object type to create (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')"),
    objectData: z.record(z.any()).describe("JSON object containing object properties (must include all required fields from the schema)"),
  },
  async toolFunction({ objectType, objectData }: { objectType: string; objectData: Record<string, any> }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}?_action=create`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'POST',
        body: JSON.stringify(objectData)
      });

      const createdObject = data as any;
      const successMessage = `Managed object created successfully with _id: ${createdObject._id}`;

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Error creating managed object: ${error.message}`);
    }
  }
};
