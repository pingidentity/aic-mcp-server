// src/tools/getManagedObjectSchema.ts
import { z } from 'zod';
import { getAuthService } from '../services/authService.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const getManagedObjectSchemaTool = {
  name: 'getManagedObjectSchema',
  title: 'Get Managed Object Schema',
  description: 'Retrieve the schema definition for a specific managed object type (e.g., alpha_user, bravo_user) from PingOne AIC. Returns only the required properties and their formats to minimize context. Use this before creating users to understand what fields are required.',
  scopes: SCOPES,
  inputSchema: {
    objectType: z.string().describe("The managed object type to get schema for (e.g., 'alpha_user', 'bravo_user', 'alpha_role')"),
  },
  async toolFunction({ objectType }: { objectType: string }) {
    const url = `https://${aicBaseUrl}/openidm/config/managed`;

    try {
      const token = await getAuthService().getToken(SCOPES);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const transactionId = response.headers.get('x-forgerock-transactionid');
        const errorMessage = `Failed to fetch managed config: ${response.status} ${response.statusText} - ${errorBody}`;
        const transactionInfo = transactionId ? `\n\nTransaction ID: ${transactionId}` : '';
        throw new Error(errorMessage + transactionInfo);
      }

      const config = await response.json();

      // Find the specific managed object by name
      const managedObject = config.objects?.find((obj: any) => obj.name === objectType);

      if (!managedObject) {
        return {
          content: [{
            type: 'text' as const,
            text: `Managed object type '${objectType}' not found. Available types: ${config.objects?.map((obj: any) => obj.name).join(', ') || 'none'}`
          }]
        };
      }

      // Extract only the essential schema information
      const schemaInfo = {
        name: managedObject.name,
        required: managedObject.schema?.required || [],
        properties: managedObject.schema?.properties || {}
      };

      const transactionId = response.headers.get('x-forgerock-transactionid');
      const transactionInfo = transactionId ? `\n\nTransaction ID: ${transactionId}` : '';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(schemaInfo, null, 2) + transactionInfo
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Error retrieving managed object schema: ${error.message}`
        }]
      };
    }
  }
};
