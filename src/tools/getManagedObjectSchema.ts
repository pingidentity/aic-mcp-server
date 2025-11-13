// src/tools/getManagedObjectSchema.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../utils/apiHelpers.js';
import { formatSuccess } from '../utils/responseHelpers.js';
import { SUPPORTED_OBJECT_TYPES } from '../config/managedObjectTypes.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const getManagedObjectSchemaTool = {
  name: 'getManagedObjectSchema',
  title: 'Get Managed Object Schema',
  description: 'Retrieve the schema definition for a specific managed object type from PingOne AIC. Supported types: alpha_user, bravo_user, alpha_role, bravo_role, alpha_group, bravo_group, alpha_organization, bravo_organization. Returns only the required properties and their formats to minimize context. Use this before creating objects to understand what fields are required.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.enum(SUPPORTED_OBJECT_TYPES).describe("The managed object type to get schema for (e.g., 'alpha_user', 'bravo_role', 'alpha_group', 'bravo_organization')"),
  },
  async toolFunction({ objectType }: { objectType: string }) {
    const url = `https://${aicBaseUrl}/openidm/config/managed`;

    try {
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES);

      const config = data as any;

      // Find the specific managed object by name
      const managedObject = config.objects?.find((obj: any) => obj.name === objectType);

      if (!managedObject) {
        return createToolResponse(
          `Managed object type '${objectType}' not found. Available types: ${config.objects?.map((obj: any) => obj.name).join(', ') || 'none'}`
        );
      }

      // Extract only the essential schema information
      const schemaInfo = {
        name: managedObject.name,
        required: managedObject.schema?.required || [],
        properties: managedObject.schema?.properties || {}
      };

      return createToolResponse(formatSuccess(schemaInfo, response));
    } catch (error: any) {
      return createToolResponse(`Error retrieving managed object schema: ${error.message}`);
    }
  }
};
