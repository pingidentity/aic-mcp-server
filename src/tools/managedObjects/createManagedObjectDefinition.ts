// src/tools/managedObjects/createManagedObjectDefinition.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const createManagedObjectDefinitionTool = {
  name: 'createManagedObjectDefinition',
  title: 'Create Managed Object Definition',
  description:
    'Create a new managed object type definition in PingOne AIC by appending to the managed config. IMPORTANT: Call getManagedObjectSchema with includeFullDefinition=true on an existing object first to understand the expected definition structure.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: false,
    openWorldHint: true
  },
  inputSchema: {
    objectName: z
      .string()
      .regex(/^[a-zA-Z0-9_]+$/, 'Object name must contain only letters, numbers, and underscores')
      .describe(
        'Name for the new managed object type (e.g., "alpha_device", "custom_application"). Must contain only a-z, A-Z, 0-9, and underscore characters.'
      ),
    objectDefinition: z
      .record(z.any())
      .describe(
        'The object definition containing at minimum a schema with properties. Call getManagedObjectSchema with includeFullDefinition=true on an existing object to see the expected structure.'
      )
  },
  async toolFunction({ objectName, objectDefinition }: { objectName: string; objectDefinition: Record<string, any> }) {
    const url = `https://${aicBaseUrl}/openidm/config/managed`;

    try {
      // GET current config to check for name collision
      const { data: configData } = await makeAuthenticatedRequest(url, SCOPES);
      const config = configData as any;

      const existingObject = config.objects?.find((obj: any) => obj.name === objectName);
      if (existingObject) {
        return createToolResponse(
          `Managed object type '${objectName}' already exists. Use patchManagedObjectDefinition to modify it, or choose a different name.`
        );
      }

      // Build the full object value with name merged into the definition
      // Spread objectDefinition first so the validated objectName always wins
      const newObjectValue = {
        ...objectDefinition,
        name: objectName
      };

      // PATCH to append new object to the objects array
      const { data: patchData, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PATCH',
        headers: {
          'If-Match': '*'
        },
        body: JSON.stringify([
          {
            operation: 'add',
            field: '/objects/-',
            value: newObjectValue
          }
        ])
      });

      // Extract confirmation of the newly added object from the response
      const updatedConfig = patchData as any;
      const addedObject = updatedConfig.objects?.find((obj: any) => obj.name === objectName);

      const successMessage = {
        message: `Created managed object definition '${objectName}'`,
        name: objectName,
        definition: addedObject || newObjectValue
      };

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Failed to create managed object definition: ${error.message}`);
    }
  }
};
