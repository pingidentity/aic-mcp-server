// src/tools/getManagedObjectSchema.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { EXAMPLE_TYPES_STRING } from '../../config/managedObjectUtils.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const getManagedObjectSchemaTool = {
  name: 'getManagedObjectSchema',
  title: 'Get Managed Object Schema',
  description: 'Retrieve schema definition for a managed object type in PingOne AIC',
  scopes: SCOPES,
  annotations: {
    readOnlyHint: true,
    openWorldHint: true
  },
  inputSchema: {
    objectType: z.string().min(1).describe(
      `Managed object type (e.g., ${EXAMPLE_TYPES_STRING}). Use listManagedObjects to discover all available types.`
    ),
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
      return createToolResponse(`Failed to retrieve managed object schema: ${error.message}`);
    }
  }
};
