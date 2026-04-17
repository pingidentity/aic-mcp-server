// src/tools/managedObjects/patchManagedObjectDefinition.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

// ForgeRock PATCH operation schema
const patchOperationSchema = z.object({
  operation: z.enum(['add', 'remove', 'replace']).describe('The patch operation type (add, remove, or replace)'),
  field: z
    .string()
    .describe(
      "The field path relative to the object definition using JSON Pointer format (e.g., '/schema/properties/email'). The tool will prepend the correct array index path internally."
    ),
  value: z.any().optional().describe('The value for the operation (required for add/replace/test operations)')
});

/**
 * Checks if a value represents a relationship property.
 * A property is a relationship if:
 * - type === "relationship" (singleton)
 * - type === "array" AND items.type === "relationship" (multi-valued)
 */
function isRelationshipValue(value: any): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (value.type === 'relationship') {
    return true;
  }
  if (value.type === 'array' && value.items?.type === 'relationship') {
    return true;
  }
  return false;
}

/**
 * Checks if a property in an existing object definition is a relationship.
 * Navigates the object definition using the field path to find the target property.
 */
function isExistingPropertyRelationship(objectDef: any, field: string): boolean {
  // The field path is relative to the object, e.g., /schema/properties/manager
  // We need to navigate the object definition to find the target property
  const segments = field.split('/').filter((s) => s !== '');

  let current = objectDef;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return false;
    }
    current = current[segment];
  }

  return isRelationshipValue(current);
}

export const patchManagedObjectDefinitionTool = {
  name: 'patchManagedObjectDefinition',
  title: 'Patch Managed Object Definition',
  description:
    'Modify an existing managed object type definition in PingOne AIC using ForgeRock PATCH operations. Operations use field paths relative to the object (e.g., /schema/properties/email). IMPORTANT: Cannot modify relationship properties — use patchManagedObjectRelationship for those.',
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
        'Name of the managed object type to modify (e.g., "alpha_user", "custom_application"). Must contain only a-z, A-Z, 0-9, and underscore characters.'
      ),
    operations: z
      .array(patchOperationSchema)
      .describe(
        'Array of ForgeRock PATCH operations to apply. Each operation has operation (add/remove/replace), field (path relative to the object, e.g., /schema/properties/email), and optional value.'
      )
  },
  async toolFunction({
    objectName,
    operations
  }: {
    objectName: string;
    operations: Array<{ operation: string; field: string; value?: any }>;
  }) {
    const url = `https://${aicBaseUrl}/openidm/config/managed`;

    try {
      // Early return if operations array is empty to avoid unnecessary network calls
      if (operations.length === 0) {
        return createToolResponse('No operations provided. Supply at least one patch operation to apply.');
      }

      // GET current config to find the array index and validate relationships
      const { data: configData } = await makeAuthenticatedRequest(url, SCOPES);
      const config = configData as any;

      const objects = config.objects || [];
      const objectIndex = objects.findIndex((obj: any) => obj.name === objectName);

      if (objectIndex === -1) {
        const availableTypes = objects.map((obj: any) => obj.name).join(', ') || 'none';
        return createToolResponse(`Managed object type '${objectName}' not found. Available types: ${availableTypes}`);
      }

      const objectDef = objects[objectIndex];

      // Validate that no operations target relationship properties
      for (const op of operations) {
        if (op.operation === 'add' || op.operation === 'replace') {
          // For add/replace, inspect the value being set
          if (isRelationshipValue(op.value)) {
            return createToolResponse(
              `Operation '${op.operation}' on field '${op.field}' targets a relationship property. Use patchManagedObjectRelationship to manage relationship properties.`
            );
          }
        } else if (op.operation === 'remove') {
          // For remove, check existing config data to see if the target is a relationship
          if (isExistingPropertyRelationship(objectDef, op.field)) {
            return createToolResponse(
              `Operation 'remove' on field '${op.field}' targets a relationship property. Use patchManagedObjectRelationship to manage relationship properties.`
            );
          }
        }
      }

      // Prepend /objects/{index} to each operation's field path
      const transformedOperations = operations.map((op) => ({
        ...op,
        field: `/objects/${objectIndex}${op.field}`
      }));

      // PATCH the managed config
      const { data: patchData, response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PATCH',
        headers: {
          'If-Match': '*'
        },
        body: JSON.stringify(transformedOperations)
      });

      const updatedConfig = patchData as any;
      const updatedObject = updatedConfig.objects?.find((obj: any) => obj.name === objectName);

      const successMessage = {
        message: `Patched managed object definition '${objectName}'`,
        name: objectName,
        operationsApplied: operations.length,
        definition: updatedObject || null
      };

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Failed to patch managed object definition: ${error.message}`);
    }
  }
};
