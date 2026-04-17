// src/tools/managedObjects/patchManagedObjectRelationship.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';
import { safePathSegmentSchema } from '../../utils/validationHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

export const patchManagedObjectRelationshipTool = {
  name: 'patchManagedObjectRelationship',
  title: 'Patch Managed Object Relationship',
  description:
    'Add, update, or remove a custom relationship property on a managed object type in PingOne AIC via the schema service. Only works with properties that have a "custom_" prefix. For add/update, provide the full relationship property definition.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    objectType: safePathSegmentSchema.describe(
      'The managed object type (e.g., "alpha_user", "bravo_role"). Must be a valid path segment.'
    ),
    propertyName: safePathSegmentSchema
      .refine((val) => val.startsWith('custom_'), {
        message: 'Property name must start with "custom_" prefix'
      })
      .describe(
        'The relationship property name. Must start with "custom_" prefix (e.g., "custom_department", "custom_teams").'
      ),
    action: z
      .enum(['add', 'update', 'remove'])
      .describe(
        'The action to perform: "add" to create a new relationship property, "update" to modify an existing one, or "remove" to delete it.'
      ),
    propertyDefinition: z
      .record(z.any())
      .optional()
      .describe(
        'The full relationship property definition. Required for add/update actions. For the expected structure, refer to an existing relationship property from getManagedObjectSchema with includeFullDefinition=true.'
      )
  },
  async toolFunction({
    objectType,
    propertyName,
    action,
    propertyDefinition
  }: {
    objectType: string;
    propertyName: string;
    action: 'add' | 'update' | 'remove';
    propertyDefinition?: Record<string, any>;
  }) {
    const url = `https://${aicBaseUrl}/openidm/schema/managed/${objectType}/properties/${propertyName}`;

    try {
      if ((action === 'add' || action === 'update') && !propertyDefinition) {
        return createToolResponse(
          `The 'propertyDefinition' parameter is required for '${action}' action. Provide the full relationship property definition.`
        );
      }

      if (action === 'remove') {
        // DELETE to remove the relationship property
        const { response } = await makeAuthenticatedRequest(url, SCOPES, {
          method: 'DELETE',
          headers: {
            'Accept-API-Version': 'resource=2.0',
            'If-Match': '*'
          }
        });

        const successMessage = {
          message: `Removed relationship property '${propertyName}' from '${objectType}'`,
          objectType,
          propertyName
        };

        return createToolResponse(formatSuccess(successMessage, response));
      }

      // PUT for add/update
      const { data, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: {
          'Accept-API-Version': 'resource=2.0',
          'If-Match': '*'
        },
        body: JSON.stringify(propertyDefinition)
      });

      const successMessage = {
        message: `${action === 'add' ? 'Added' : 'Updated'} relationship property '${propertyName}' on '${objectType}'`,
        objectType,
        propertyName,
        definition: data
      };

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      if (error.message?.includes('400')) {
        return createToolResponse(
          `Failed to ${action} relationship property '${propertyName}': bad request. Check that the property definition is valid and the object type '${objectType}' exists. Error: ${error.message}`
        );
      }
      if (error.message?.includes('404')) {
        return createToolResponse(
          `Failed to ${action} relationship property '${propertyName}': not found. Verify that the object type '${objectType}' exists and the property name is correct. Error: ${error.message}`
        );
      }
      return createToolResponse(
        `Failed to ${action} relationship property '${propertyName}' on '${objectType}': ${error.message}`
      );
    }
  }
};
