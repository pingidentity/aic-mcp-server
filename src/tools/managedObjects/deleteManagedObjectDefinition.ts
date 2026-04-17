// src/tools/managedObjects/deleteManagedObjectDefinition.ts
import { z } from 'zod';
import { makeAuthenticatedRequest, createToolResponse } from '../../utils/apiHelpers.js';
import { formatSuccess } from '../../utils/responseHelpers.js';

const aicBaseUrl = process.env.AIC_BASE_URL;

const SCOPES = ['fr:idm:*'];

/**
 * Checks if a property has a resourceCollection that references the target object.
 * Returns the property name if it does, null otherwise.
 */
function getResourceCollectionReferences(properties: Record<string, any>, targetObjectName: string): string[] {
  const referencingProperties: string[] = [];
  const targetPath = `managed/${targetObjectName}`;

  for (const [propName, propDef] of Object.entries(properties)) {
    if (!propDef || typeof propDef !== 'object') {
      continue;
    }

    // Check direct relationship properties (type: "relationship")
    if (propDef.type === 'relationship') {
      const resourceCollection = propDef.resourceCollection;
      if (Array.isArray(resourceCollection) && resourceCollection.some((rc: any) => rc.path === targetPath)) {
        referencingProperties.push(propName);
      }
    }

    // Check array-type relationship properties (type: "array" with items.type: "relationship")
    if (propDef.type === 'array' && propDef.items?.type === 'relationship') {
      const resourceCollection = propDef.items.resourceCollection;
      if (Array.isArray(resourceCollection) && resourceCollection.some((rc: any) => rc.path === targetPath)) {
        referencingProperties.push(propName);
      }
    }
  }

  return referencingProperties;
}

export const deleteManagedObjectDefinitionTool = {
  name: 'deleteManagedObjectDefinition',
  title: 'Delete Managed Object Definition',
  description:
    'Delete a managed object type definition from PingOne AIC. Removes the object type from the managed config. IMPORTANT: This will fail if other object types have relationship properties referencing this object type.',
  scopes: SCOPES,
  annotations: {
    destructiveHint: true,
    openWorldHint: true
  },
  inputSchema: {
    objectName: z
      .string()
      .regex(/^[a-zA-Z0-9_]+$/, 'Object name must contain only letters, numbers, and underscores')
      .describe(
        'Name of the managed object type to delete (e.g., "alpha_device", "custom_application"). Must contain only a-z, A-Z, 0-9, and underscore characters.'
      )
  },
  async toolFunction({ objectName }: { objectName: string }) {
    const url = `https://${aicBaseUrl}/openidm/config/managed`;

    try {
      // GET current config to check existence and references
      const { data: configData } = await makeAuthenticatedRequest(url, SCOPES);
      const config = configData as any;

      const objects = config.objects || [];
      const targetObject = objects.find((obj: any) => obj.name === objectName);

      if (!targetObject) {
        const availableTypes = objects.map((obj: any) => obj.name).join(', ') || 'none';
        return createToolResponse(`Managed object type '${objectName}' not found. Available types: ${availableTypes}`);
      }

      // Scan all OTHER object definitions for relationship references to the target
      const references: Array<{ objectName: string; properties: string[] }> = [];

      for (const obj of objects) {
        if (obj.name === objectName) {
          continue;
        }

        const properties = obj.schema?.properties;
        if (!properties || typeof properties !== 'object') {
          continue;
        }

        const referencingProps = getResourceCollectionReferences(properties, objectName);
        if (referencingProps.length > 0) {
          references.push({
            objectName: obj.name,
            properties: referencingProps
          });
        }
      }

      if (references.length > 0) {
        const referenceList = references
          .map((ref) => `${ref.objectName} (properties: ${ref.properties.join(', ')})`)
          .join('; ');
        return createToolResponse(
          `Cannot delete managed object type '${objectName}' because it is referenced by relationship properties in other objects: ${referenceList}. Remove or update these relationship properties first using patchManagedObjectRelationship.`
        );
      }

      const removedDefinition = targetObject;

      // PUT the full config with the target object filtered out
      // Position-based PATCH removes are rejected and value-based predicates are silently ignored,
      // so read-modify-PUT is the only reliable approach for config endpoint deletions
      const updatedObjects = objects.filter((obj: any) => obj.name !== objectName);
      const updatedConfig = { ...config, objects: updatedObjects };

      const { response } = await makeAuthenticatedRequest(url, SCOPES, {
        method: 'PUT',
        headers: {
          'If-Match': '*'
        },
        body: JSON.stringify(updatedConfig)
      });

      const successMessage = {
        message: `Deleted managed object definition '${objectName}'`,
        name: objectName,
        removedDefinition
      };

      return createToolResponse(formatSuccess(successMessage, response));
    } catch (error: any) {
      return createToolResponse(`Failed to delete managed object definition: ${error.message}`);
    }
  }
};
