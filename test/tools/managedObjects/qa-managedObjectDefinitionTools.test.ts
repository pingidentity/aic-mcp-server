/**
 * QA Tests for IAM-10745: Managed Object Definition Tools
 *
 * These tests verify acceptance criteria, edge cases, and potential regressions
 * not covered by the existing test suite.
 */
import { describe, it, expect } from 'vitest';
import { createManagedObjectDefinitionTool } from '../../../src/tools/managedObjects/createManagedObjectDefinition.js';
import { patchManagedObjectDefinitionTool } from '../../../src/tools/managedObjects/patchManagedObjectDefinition.js';
import { deleteManagedObjectDefinitionTool } from '../../../src/tools/managedObjects/deleteManagedObjectDefinition.js';
import { patchManagedObjectRelationshipTool } from '../../../src/tools/managedObjects/patchManagedObjectRelationship.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { mockGetConfig } from '../../helpers/managedConfigMocks.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

// Import barrel to verify tool registration
import * as managedObjectTools from '../../../src/tools/managedObjects/index.js';

describe('QA: IAM-10745 Managed Object Definition Tools', () => {
  const getSpy = setupTestEnvironment();

  // ==========================================================================
  // AC-9: All four tools use scope fr:idm:* and follow existing tool patterns
  // ==========================================================================
  describe('AC-9: Tool pattern compliance and scope verification', () => {
    it('all four tools are exported from the barrel file', () => {
      expect(managedObjectTools.createManagedObjectDefinitionTool).toBeDefined();
      expect(managedObjectTools.patchManagedObjectDefinitionTool).toBeDefined();
      expect(managedObjectTools.deleteManagedObjectDefinitionTool).toBeDefined();
      expect(managedObjectTools.patchManagedObjectRelationshipTool).toBeDefined();
    });

    it('all four tools define required Tool interface properties', () => {
      const tools = [
        createManagedObjectDefinitionTool,
        patchManagedObjectDefinitionTool,
        deleteManagedObjectDefinitionTool,
        patchManagedObjectRelationshipTool
      ];

      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('title');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('scopes');
        expect(tool).toHaveProperty('annotations');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('toolFunction');
        expect(typeof tool.toolFunction).toBe('function');
      }
    });

    it('all four tools use scope fr:idm:*', () => {
      expect(createManagedObjectDefinitionTool.scopes).toEqual(['fr:idm:*']);
      expect(patchManagedObjectDefinitionTool.scopes).toEqual(['fr:idm:*']);
      expect(deleteManagedObjectDefinitionTool.scopes).toEqual(['fr:idm:*']);
      expect(patchManagedObjectRelationshipTool.scopes).toEqual(['fr:idm:*']);
    });

    it('tool names follow verbManagedObject* convention', () => {
      expect(createManagedObjectDefinitionTool.name).toBe('createManagedObjectDefinition');
      expect(patchManagedObjectDefinitionTool.name).toBe('patchManagedObjectDefinition');
      expect(deleteManagedObjectDefinitionTool.name).toBe('deleteManagedObjectDefinition');
      expect(patchManagedObjectRelationshipTool.name).toBe('patchManagedObjectRelationship');
    });
  });

  // ==========================================================================
  // AC-11: safePathSegmentSchema on URL path parameters
  // ==========================================================================
  describe('AC-11: Path traversal prevention on URL path parameters', () => {
    it('patchManagedObjectRelationship rejects objectType with path traversal', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.objectType;
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse('alpha_user/../admin')).toThrow();
      expect(() => schema.parse('%2e%2e/admin')).toThrow();
    });

    it('patchManagedObjectRelationship rejects propertyName with path traversal', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      // Must start with custom_ AND not have path traversal
      expect(() => schema.parse('custom_../bad')).toThrow();
      expect(() => schema.parse('custom_path/bad')).toThrow();
    });

    it('create/patch/delete objectName regex inherently prevents path traversal', () => {
      // The regex ^[a-zA-Z0-9_]+$ already prevents / and . characters
      const schemas = [
        createManagedObjectDefinitionTool.inputSchema.objectName,
        patchManagedObjectDefinitionTool.inputSchema.objectName,
        deleteManagedObjectDefinitionTool.inputSchema.objectName
      ];

      for (const schema of schemas) {
        expect(() => schema.parse('../etc')).toThrow();
        expect(() => schema.parse('a/b')).toThrow();
        expect(() => schema.parse('a..b')).toThrow();
      }
    });
  });

  // ==========================================================================
  // AC-1: createManagedObjectDefinition - PATCH add to /objects/-
  // ==========================================================================
  describe('AC-1: createManagedObjectDefinition PATCH add operation', () => {
    it('sends ForgeRock PATCH format (operation/field/value, not op/path)', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({ _id: 'managed', objects: [] });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'test_obj',
        objectDefinition: { schema: { properties: {} } }
      });

      const callArgs = getSpy().mock.calls[1];
      const body = JSON.parse(callArgs[2].body);
      // Must be ForgeRock format, NOT JSON Patch format
      expect(body[0]).toHaveProperty('operation');
      expect(body[0]).toHaveProperty('field');
      expect(body[0]).toHaveProperty('value');
      expect(body[0]).not.toHaveProperty('op');
      expect(body[0]).not.toHaveProperty('path');
    });

    it('uses If-Match: * wildcard header', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({ _id: 'managed', objects: [] });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'test_obj',
        objectDefinition: { schema: { properties: {} } }
      });

      const patchCall = getSpy().mock.calls[1];
      expect(patchCall[2].headers['If-Match']).toBe('*');
    });

    it('field path is exactly /objects/-', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({ _id: 'managed', objects: [] });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'new_type',
        objectDefinition: { schema: { properties: {} } }
      });

      const body = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(body[0].field).toBe('/objects/-');
    });
  });

  // ==========================================================================
  // AC-2: createManagedObjectDefinition rejects duplicates
  // ==========================================================================
  describe('AC-2: Duplicate name rejection', () => {
    it('rejects when exact name match exists (case-sensitive)', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [{ name: 'alpha_user', schema: { properties: {} } }]
          });
        })
      );

      const result = await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        objectDefinition: { schema: { properties: {} } }
      });

      expect(result.content[0].text).toContain('already exists');
      // Verify no PATCH was sent
      expect(getSpy().mock.calls.length).toBe(1);
    });

    it('allows creation when name differs only by case', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [{ name: 'alpha_user', schema: { properties: {} } }]
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'Alpha_User',
        objectDefinition: { schema: { properties: {} } }
      });

      // Should have made PATCH call since names are case-sensitive
      expect(getSpy().mock.calls.length).toBe(2);
    });
  });

  // ==========================================================================
  // Name override prevention (fix-review-1 Finding 1)
  // ==========================================================================
  describe('Name override prevention in create', () => {
    it('objectDefinition.name cannot override validated objectName', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({ _id: 'managed', objects: [] });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'safe_name',
        objectDefinition: {
          name: 'injected_name',
          schema: { properties: {} }
        }
      });

      const body = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(body[0].value.name).toBe('safe_name');
    });

    it('other fields from objectDefinition are preserved alongside name', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({ _id: 'managed', objects: [] });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'test_obj',
        objectDefinition: {
          schema: { properties: { x: { type: 'string' } } },
          onCreate: { type: 'text/javascript' },
          customField: 'preserved'
        }
      });

      const body = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(body[0].value.name).toBe('test_obj');
      expect(body[0].value.schema).toBeDefined();
      expect(body[0].value.onCreate).toBeDefined();
      expect(body[0].value.customField).toBe('preserved');
    });
  });

  // ==========================================================================
  // AC-3: patchManagedObjectDefinition applies operations with If-Match
  // ==========================================================================
  describe('AC-3: patchManagedObjectDefinition ForgeRock PATCH operations', () => {
    const basicObjects = [
      {
        name: 'alpha_user',
        schema: { properties: { userName: { type: 'string' }, email: { type: 'string' } } }
      }
    ];

    it('sends ForgeRock format operations (not JSON Patch)', async () => {
      mockGetConfig(basicObjects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [
          { operation: 'replace', field: '/schema/properties/email', value: { type: 'string', title: 'Email' } }
        ]
      });

      const body = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(body[0]).toHaveProperty('operation');
      expect(body[0]).toHaveProperty('field');
      expect(body[0]).not.toHaveProperty('op');
      expect(body[0]).not.toHaveProperty('path');
    });

    it('correctly resolves array index and prepends it', async () => {
      const objects = [
        { name: 'first_obj', schema: { properties: {} } },
        { name: 'second_obj', schema: { properties: {} } },
        { name: 'target_obj', schema: { properties: { x: { type: 'string' } } } }
      ];
      mockGetConfig(objects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'target_obj',
        operations: [{ operation: 'add', field: '/schema/properties/y', value: { type: 'number' } }]
      });

      const body = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(body[0].field).toBe('/objects/2/schema/properties/y');
    });
  });

  // ==========================================================================
  // AC-4: Relationship validation boundary
  // ==========================================================================
  describe('AC-4: Relationship property validation', () => {
    const objectsWithRelationships = [
      {
        name: 'alpha_user',
        schema: {
          properties: {
            userName: { type: 'string' },
            manager: {
              type: 'relationship',
              resourceCollection: [{ path: 'managed/alpha_user' }]
            },
            roles: {
              type: 'array',
              items: { type: 'relationship', resourceCollection: [{ path: 'managed/bravo_role' }] }
            }
          }
        }
      }
    ];

    it('rejects add with value containing nested relationship in deeper structure', async () => {
      mockGetConfig(objectsWithRelationships);

      // This tests that the detection is at the VALUE level, not deeper nesting
      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [
          {
            operation: 'add',
            field: '/schema/properties/custom_rel',
            value: { type: 'array', items: { type: 'relationship' } }
          }
        ]
      });

      expect(result.content[0].text).toContain('relationship property');
      expect(result.content[0].text).toContain('patchManagedObjectRelationship');
    });

    it('allows add operation with null/undefined value (edge case)', async () => {
      mockGetConfig(objectsWithRelationships);

      // null and undefined values are not relationship types
      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'add', field: '/schema/properties/newField', value: null }]
      });

      // Should proceed to PATCH
      expect(getSpy().mock.calls.length).toBe(2);
    });

    it('allows replace with primitive value', async () => {
      mockGetConfig(objectsWithRelationships);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'replace', field: '/schema/title', value: 'Updated Title' }]
      });

      expect(getSpy().mock.calls.length).toBe(2);
    });

    it('remove validation checks against existing config, not value', async () => {
      mockGetConfig(objectsWithRelationships);

      // Remove on a relationship field should be rejected even without a value
      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'remove', field: '/schema/properties/manager' }]
      });

      expect(result.content[0].text).toContain('relationship property');
      expect(getSpy().mock.calls.length).toBe(1); // Only GET, no PATCH
    });

    it('remove on multi-valued relationship is also rejected', async () => {
      mockGetConfig(objectsWithRelationships);

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'remove', field: '/schema/properties/roles' }]
      });

      expect(result.content[0].text).toContain('relationship property');
    });

    it('message directs agent to use patchManagedObjectRelationship', async () => {
      mockGetConfig(objectsWithRelationships);

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'add', field: '/schema/properties/x', value: { type: 'relationship' } }]
      });

      expect(result.content[0].text).toContain('patchManagedObjectRelationship');
    });
  });

  // ==========================================================================
  // Empty operations early return (fix-review-1 Finding 6)
  // ==========================================================================
  describe('Empty operations early return in patch', () => {
    it('returns immediately without making any API calls', async () => {
      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: []
      });

      expect(result.content[0].text).toContain('No operations provided');
      expect(getSpy().mock.calls.length).toBe(0);
    });
  });

  // ==========================================================================
  // AC-5: deleteManagedObjectDefinition - read-modify-PUT
  // ==========================================================================
  describe('AC-5: deleteManagedObjectDefinition read-modify-PUT', () => {
    it('sends PUT with target object filtered out', async () => {
      const objects = [{ name: 'alpha_user', schema: { properties: { userName: { type: 'string' } } } }];
      mockGetConfig(objects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user'
      });

      const callArgs = getSpy().mock.calls[1];
      expect(callArgs[2].method).toBe('PUT');
      const body = JSON.parse(callArgs[2].body);
      expect(body.objects).toEqual([]);
    });

    it('uses If-Match with wildcard', async () => {
      const objects = [{ name: 'alpha_user', schema: { properties: { userName: { type: 'string' } } } }];
      mockGetConfig(objects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user'
      });

      expect(getSpy().mock.calls[1][2].headers['If-Match']).toBe('*');
    });
  });

  // ==========================================================================
  // AC-6: deleteManagedObjectDefinition reference checking
  // ==========================================================================
  describe('AC-6: Reference checking in delete', () => {
    it('scans direct relationships (type: relationship) for resourceCollection', async () => {
      const objects = [
        {
          name: 'dept',
          schema: { properties: { name: { type: 'string' } } }
        },
        {
          name: 'user',
          schema: {
            properties: {
              dept: {
                type: 'relationship',
                resourceCollection: [{ path: 'managed/dept' }]
              }
            }
          }
        }
      ];
      mockGetConfig(objects);

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'dept'
      });

      expect(result.content[0].text).toContain('Cannot delete');
      expect(result.content[0].text).toContain('user');
      expect(result.content[0].text).toContain('dept');
    });

    it('scans array-type relationships (items.type: relationship) for resourceCollection', async () => {
      const objects = [
        {
          name: 'role',
          schema: { properties: { name: { type: 'string' } } }
        },
        {
          name: 'user',
          schema: {
            properties: {
              roles: {
                type: 'array',
                items: {
                  type: 'relationship',
                  resourceCollection: [{ path: 'managed/role' }]
                }
              }
            }
          }
        }
      ];
      mockGetConfig(objects);

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'role'
      });

      expect(result.content[0].text).toContain('Cannot delete');
      expect(result.content[0].text).toContain('user');
      expect(result.content[0].text).toContain('roles');
    });

    it('returns list of all referencing objects in the blocking message', async () => {
      const objects = [
        { name: 'target', schema: { properties: { x: { type: 'string' } } } },
        {
          name: 'user',
          schema: {
            properties: {
              ref1: { type: 'relationship', resourceCollection: [{ path: 'managed/target' }] }
            }
          }
        },
        {
          name: 'group',
          schema: {
            properties: {
              ref2: {
                type: 'array',
                items: { type: 'relationship', resourceCollection: [{ path: 'managed/target' }] }
              }
            }
          }
        }
      ];
      mockGetConfig(objects);

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'target'
      });

      const text = result.content[0].text;
      expect(text).toContain('user');
      expect(text).toContain('ref1');
      expect(text).toContain('group');
      expect(text).toContain('ref2');
    });

    it('does not block on self-referencing relationships', async () => {
      const objects = [
        {
          name: 'user',
          schema: {
            properties: {
              manager: {
                type: 'relationship',
                resourceCollection: [{ path: 'managed/user' }]
              }
            }
          }
        }
      ];
      mockGetConfig(objects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'user'
      });

      // Should have proceeded to PUT
      expect(getSpy().mock.calls.length).toBe(2);
    });
  });

  // ==========================================================================
  // AC-7: patchManagedObjectRelationship PUT with correct headers
  // ==========================================================================
  describe('AC-7: patchManagedObjectRelationship PUT for add/update', () => {
    const propDef = {
      type: 'relationship',
      title: 'Custom Rel',
      resourceCollection: [{ path: 'managed/alpha_user' }]
    };

    it('sends PUT to correct schema service URL', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'add',
        propertyDefinition: propDef
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toBe('https://test.forgeblocks.com/openidm/schema/managed/alpha_user/properties/custom_dept');
    });

    it('includes Accept-API-Version: resource=2.0 header', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'add',
        propertyDefinition: propDef
      });

      const headers = getSpy().mock.calls[0][2].headers;
      expect(headers['Accept-API-Version']).toBe('resource=2.0');
    });

    it('includes If-Match: * header (wildcard)', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'update',
        propertyDefinition: propDef
      });

      const headers = getSpy().mock.calls[0][2].headers;
      expect(headers['If-Match']).toBe('*');
    });

    it('sends propertyDefinition as request body', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'add',
        propertyDefinition: propDef
      });

      const body = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(body).toEqual(propDef);
    });
  });

  // ==========================================================================
  // AC-8: patchManagedObjectRelationship DELETE
  // ==========================================================================
  describe('AC-8: patchManagedObjectRelationship DELETE for remove', () => {
    it('sends DELETE method to schema service URL', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'remove'
      });

      const call = getSpy().mock.calls[0];
      expect(call[0]).toBe('https://test.forgeblocks.com/openidm/schema/managed/alpha_user/properties/custom_dept');
      expect(call[2].method).toBe('DELETE');
    });

    it('includes Accept-API-Version header on DELETE', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'remove'
      });

      expect(getSpy().mock.calls[0][2].headers['Accept-API-Version']).toBe('resource=2.0');
    });

    it('includes If-Match: * header on DELETE', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'remove'
      });

      expect(getSpy().mock.calls[0][2].headers['If-Match']).toBe('*');
    });

    it('does not send request body for DELETE', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'remove'
      });

      expect(getSpy().mock.calls[0][2].body).toBeUndefined();
    });
  });

  // ==========================================================================
  // custom_ prefix enforcement
  // ==========================================================================
  describe('custom_ prefix enforcement on propertyName', () => {
    it('rejects property names without custom_ prefix', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      expect(() => schema.parse('manager')).toThrow();
      expect(() => schema.parse('roles')).toThrow();
      expect(() => schema.parse('department')).toThrow();
    });

    it('rejects custom_ appearing mid-string', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      expect(() => schema.parse('my_custom_field')).toThrow();
    });

    it('accepts properly prefixed names', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      expect(() => schema.parse('custom_department')).not.toThrow();
      expect(() => schema.parse('custom_x')).not.toThrow();
      expect(() => schema.parse('custom_teams_v2')).not.toThrow();
    });
  });

  // ==========================================================================
  // destructiveHint verification (fix-review-1 Finding 5)
  // ==========================================================================
  describe('destructiveHint annotations', () => {
    it('patchManagedObjectRelationship has destructiveHint: true', () => {
      expect(patchManagedObjectRelationshipTool.annotations.destructiveHint).toBe(true);
    });

    it('deleteManagedObjectDefinition has destructiveHint: true', () => {
      expect(deleteManagedObjectDefinitionTool.annotations.destructiveHint).toBe(true);
    });

    it('createManagedObjectDefinition has destructiveHint: false', () => {
      expect(createManagedObjectDefinitionTool.annotations.destructiveHint).toBe(false);
    });

    it('patchManagedObjectDefinition has destructiveHint: false', () => {
      expect(patchManagedObjectDefinitionTool.annotations.destructiveHint).toBe(false);
    });
  });

  // ==========================================================================
  // Operation restriction (fix-review-1 Finding 2)
  // ==========================================================================
  describe('Operation type restriction to add/remove/replace', () => {
    it('rejects move operation', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.operations;
      expect(() => schema.parse([{ operation: 'move', field: '/a', value: '/b' }])).toThrow();
    });

    it('rejects copy operation', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.operations;
      expect(() => schema.parse([{ operation: 'copy', field: '/a', value: '/b' }])).toThrow();
    });

    it('rejects test operation', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.operations;
      expect(() => schema.parse([{ operation: 'test', field: '/a', value: 'x' }])).toThrow();
    });
  });

  // ==========================================================================
  // Edge case: relationship validation with deeply nested or unusual structures
  // ==========================================================================
  describe('Edge cases: relationship detection', () => {
    it('does not false-positive on object with type field that is not "relationship"', async () => {
      const objects = [{ name: 'obj', schema: { properties: { x: { type: 'string' } } } }];
      mockGetConfig(objects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'obj',
        operations: [
          {
            operation: 'add',
            field: '/schema/properties/y',
            value: { type: 'object', properties: { z: { type: 'string' } } }
          }
        ]
      });

      // Should proceed to PATCH, not rejected
      expect(getSpy().mock.calls.length).toBe(2);
    });

    it('does not false-positive on array with non-relationship items', async () => {
      const objects = [{ name: 'obj', schema: { properties: { x: { type: 'string' } } } }];
      mockGetConfig(objects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'obj',
        operations: [
          {
            operation: 'add',
            field: '/schema/properties/tags',
            value: { type: 'array', items: { type: 'string' } }
          }
        ]
      });

      expect(getSpy().mock.calls.length).toBe(2);
    });

    it('detects relationship when add value has type array with items.type relationship', async () => {
      const objects = [{ name: 'obj', schema: { properties: {} } }];
      mockGetConfig(objects);

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'obj',
        operations: [
          {
            operation: 'add',
            field: '/schema/properties/rels',
            value: {
              type: 'array',
              items: { type: 'relationship', resourceCollection: [] }
            }
          }
        ]
      });

      expect(result.content[0].text).toContain('relationship property');
    });
  });

  // ==========================================================================
  // Edge case: response does not leak full config
  // ==========================================================================
  describe('Response handling: no full config leakage', () => {
    it('create response contains only the new object, not existing objects', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [{ name: 'existing_obj', schema: { properties: { secret: { type: 'string' } } } }]
          });
        }),
        http.patch('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [
              { name: 'existing_obj', schema: { properties: { secret: { type: 'string' } } } },
              { name: 'new_obj', schema: { properties: {} } }
            ]
          });
        })
      );

      const result = await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'new_obj',
        objectDefinition: { schema: { properties: {} } }
      });

      const text = result.content[0].text;
      expect(text).not.toContain('existing_obj');
      expect(text).not.toContain('secret');
      expect(text).toContain('new_obj');
    });
  });

  // ==========================================================================
  // Edge case: patchManagedObjectRelationship requires propertyDefinition for add/update
  // ==========================================================================
  describe('patchManagedObjectRelationship propertyDefinition requirement', () => {
    it('returns error when add action has no propertyDefinition', async () => {
      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'add'
      });

      expect(result.content[0].text).toContain("'propertyDefinition' parameter is required");
      expect(getSpy().mock.calls.length).toBe(0);
    });

    it('returns error when update action has no propertyDefinition', async () => {
      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'update'
      });

      expect(result.content[0].text).toContain("'propertyDefinition' parameter is required");
      expect(getSpy().mock.calls.length).toBe(0);
    });

    it('remove does not require propertyDefinition', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_dept',
        action: 'remove'
      });

      expect(getSpy().mock.calls.length).toBe(1);
    });
  });

  // ==========================================================================
  // Edge case: reference checking with resourceCollection that has multiple entries
  // ==========================================================================
  describe('Reference checking with multi-entry resourceCollection', () => {
    it('detects reference even when target path is not first in resourceCollection', async () => {
      const objects = [
        { name: 'target', schema: { properties: { x: { type: 'string' } } } },
        {
          name: 'referrer',
          schema: {
            properties: {
              linked: {
                type: 'relationship',
                resourceCollection: [{ path: 'managed/other' }, { path: 'managed/another' }, { path: 'managed/target' }]
              }
            }
          }
        }
      ];
      mockGetConfig(objects);

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'target'
      });

      expect(result.content[0].text).toContain('Cannot delete');
      expect(result.content[0].text).toContain('referrer');
    });
  });

  // ==========================================================================
  // Edge case: delete reference checking ignores properties with null/undefined resourceCollection
  // ==========================================================================
  describe('Reference checking handles missing/null resourceCollection', () => {
    it('does not crash on relationship property with no resourceCollection', async () => {
      const objects = [
        { name: 'target', schema: { properties: { x: { type: 'string' } } } },
        {
          name: 'other',
          schema: {
            properties: {
              broken: {
                type: 'relationship'
                // no resourceCollection
              }
            }
          }
        }
      ];
      mockGetConfig(objects);

      // Should not crash and should not block deletion
      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'target'
      });

      expect(getSpy().mock.calls.length).toBe(2);
    });

    it('does not crash on array relationship with null resourceCollection in items', async () => {
      const objects = [
        { name: 'target', schema: { properties: { x: { type: 'string' } } } },
        {
          name: 'other',
          schema: {
            properties: {
              broken: {
                type: 'array',
                items: {
                  type: 'relationship',
                  resourceCollection: null
                }
              }
            }
          }
        }
      ];
      mockGetConfig(objects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'target'
      });

      expect(getSpy().mock.calls.length).toBe(2);
    });
  });

  // ==========================================================================
  // Delete uses read-modify-PUT regardless of array position
  // ==========================================================================
  describe('Delete filters correctly for any array position', () => {
    it('PUTs config with middle object filtered out when no references exist', async () => {
      const objects = [
        { name: 'first', schema: { properties: { x: { type: 'string' } } } },
        { name: 'middle', schema: { properties: { y: { type: 'string' } } } },
        { name: 'last', schema: { properties: { z: { type: 'string' } } } }
      ];
      mockGetConfig(objects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'middle'
      });

      const callArgs = getSpy().mock.calls[1];
      expect(callArgs[2].method).toBe('PUT');
      const body = JSON.parse(callArgs[2].body);
      expect(body.objects).toHaveLength(2);
      expect(body.objects.map((o: any) => o.name)).toEqual(['first', 'last']);
    });
  });

  // ==========================================================================
  // Edge case: patch relationship validation with field path that doesn't resolve
  // ==========================================================================
  describe('Patch relationship validation with unresolvable field paths', () => {
    it('allows remove on deeply nested non-existent path (fails at API, not validation)', async () => {
      const objects = [{ name: 'obj', schema: { properties: { x: { type: 'string' } } } }];
      mockGetConfig(objects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'obj',
        operations: [{ operation: 'remove', field: '/schema/properties/nonexistent/deeply/nested' }]
      });

      // isExistingPropertyRelationship will return false for unresolvable paths,
      // allowing the operation through. The API will handle the actual error.
      expect(getSpy().mock.calls.length).toBe(2);
    });
  });
});
