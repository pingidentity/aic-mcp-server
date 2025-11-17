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
  description: 'Retrieve a managed object\'s complete profile by its unique identifier (_id) from PingOne AIC. Supported types: alpha_user, bravo_user, alpha_role, bravo_role, alpha_group, bravo_group, alpha_organization, bravo_organization. Returns the full object.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.enum(SUPPORTED_OBJECT_TYPES).describe("The managed object type (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')"),
    objectId: objectIdSchema.describe("The unique identifier (_id) of the object to retrieve"),
  },
  async toolFunction({ objectType, objectId }: { objectType: string; objectId: string }) {
    const url = `https://${aicBaseUrl}/openidm/managed/${objectType}/${objectId}`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);
      return createToolResponse(formatSuccess(data, response));
    } catch (error: any) {
      return createToolResponse(`Error retrieving managed object: ${error.message}`);
    }
  }
};
