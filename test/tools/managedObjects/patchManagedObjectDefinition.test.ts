import { describe, it, expect } from 'vitest';
import { patchManagedObjectDefinitionTool } from '../../../src/tools/managedObjects/patchManagedObjectDefinition.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { mockGetConfig, mockGetAndPatch } from '../../helpers/managedConfigMocks.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('patchManagedObjectDefinition', () => {
  const getSpy = setupTestEnvironment();

  const basicObjects = [
    {
      name: 'alpha_user',
      schema: {
        properties: {
          userName: { type: 'string' },
          email: { type: 'string' },
          manager: {
            type: 'relationship',
            resourceCollection: [{ path: 'managed/alpha_user' }]
          },
          roles: {
            type: 'array',
            items: {
              type: 'relationship',
              resourceCollection: [{ path: 'managed/bravo_role' }]
            }
          }
        }
      }
    },
    {
      name: 'bravo_role',
      schema: {
        properties: {
          name: { type: 'string' }
        }
      }
    }
  ];

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('patchManagedObjectDefinition', patchManagedObjectDefinitionTool);
  });

  // ===== EARLY RETURN TESTS =====
  describe('Early Return', () => {
    it('should return early with a message if operations array is empty', async () => {
      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: []
      });

      expect(result.content[0].text).toContain('No operations provided');
      // Should not have made any API calls
      expect(getSpy().mock.calls.length).toBe(0);
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should GET config/managed first to resolve array index', async () => {
      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [
          { operation: 'replace', field: '/schema/properties/email', value: { type: 'string', title: 'Email' } }
        ]
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/openidm/config/managed');
      // First call should be GET (no options or no method specified)
      expect(calls[0][2]).toBeUndefined();
    });

    it('should send PATCH to config/managed with correct URL', async () => {
      mockGetConfig(basicObjects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [
          { operation: 'replace', field: '/schema/properties/email', value: { type: 'string', title: 'Email' } }
        ]
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1][0]).toBe('https://test.forgeblocks.com/openidm/config/managed');
      expect(calls[1][2]?.method).toBe('PATCH');
    });

    it('should add If-Match header with wildcard', async () => {
      mockGetConfig(basicObjects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      const callArgs = getSpy().mock.calls[1];
      const requestOptions = callArgs[2];
      expect(requestOptions.headers['If-Match']).toBe('*');
    });

    it('should prepend /objects/{index} to each operation field path', async () => {
      mockGetConfig(basicObjects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [
          { operation: 'replace', field: '/schema/properties/email', value: { type: 'string', title: 'Email' } }
        ]
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);
      // alpha_user is at index 0
      expect(requestBody[0].field).toBe('/objects/0/schema/properties/email');
    });

    it('should use correct index for non-first object', async () => {
      mockGetConfig(basicObjects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'bravo_role',
        operations: [
          { operation: 'replace', field: '/schema/properties/name', value: { type: 'string', title: 'Role Name' } }
        ]
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);
      // bravo_role is at index 1
      expect(requestBody[0].field).toBe('/objects/1/schema/properties/name');
    });

    it('should handle multiple operations and prepend index to each', async () => {
      mockGetConfig(basicObjects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [
          { operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } },
          { operation: 'add', field: '/schema/properties/phone', value: { type: 'string' } },
          { operation: 'remove', field: '/schema/properties/userName' }
        ]
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);

      expect(requestBody).toHaveLength(3);
      expect(requestBody[0].field).toBe('/objects/0/schema/properties/email');
      expect(requestBody[1].field).toBe('/objects/0/schema/properties/phone');
      expect(requestBody[2].field).toBe('/objects/0/schema/properties/userName');
    });

    it('should preserve operation and value in transformed operations', async () => {
      mockGetConfig(basicObjects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [
          { operation: 'replace', field: '/schema/properties/email', value: { type: 'string', title: 'Email Address' } }
        ]
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);

      expect(requestBody[0].operation).toBe('replace');
      expect(requestBody[0].value).toEqual({ type: 'string', title: 'Email Address' });
    });

    it('should handle remove operation without value field', async () => {
      mockGetConfig(basicObjects);

      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'remove', field: '/schema/properties/userName' }]
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);

      expect(requestBody[0].operation).toBe('remove');
      expect(requestBody[0].field).toBe('/objects/0/schema/properties/userName');
      expect(requestBody[0]).not.toHaveProperty('value');
    });

    it('should pass correct scopes to auth', async () => {
      await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      expect(getSpy()).toHaveBeenCalledWith(expect.any(String), ['fr:idm:*'], expect.anything());
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should return error if objectName not found in config', async () => {
      mockGetConfig(basicObjects);

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'nonexistent_type',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      expect(result.content[0].text).toContain("Managed object type 'nonexistent_type' not found");
      expect(result.content[0].text).toContain('alpha_user');
      expect(result.content[0].text).toContain('bravo_role');
      // Should not have made a PATCH call
      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(1); // Only the GET
    });

    it('should return error listing available types when objectName not found', async () => {
      mockGetConfig(basicObjects);

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'nonexistent',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      expect(result.content[0].text).toContain('Available types: alpha_user, bravo_role');
    });

    it('should handle empty objects array', async () => {
      mockGetConfig([]);

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      expect(result.content[0].text).toContain("Managed object type 'alpha_user' not found");
      expect(result.content[0].text).toContain('Available types: none');
    });

    it('should handle missing objects array', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed'
          });
        })
      );

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      expect(result.content[0].text).toContain("Managed object type 'alpha_user' not found");
    });

    // --- Relationship Validation ---
    describe('Relationship Validation', () => {
      it('should reject add operation with singleton relationship value', async () => {
        mockGetConfig(basicObjects);

        const result = await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [
            {
              operation: 'add',
              field: '/schema/properties/supervisor',
              value: {
                type: 'relationship',
                resourceCollection: [{ path: 'managed/alpha_user' }]
              }
            }
          ]
        });

        expect(result.content[0].text).toContain(
          "Operation 'add' on field '/schema/properties/supervisor' targets a relationship property"
        );
        expect(result.content[0].text).toContain('patchManagedObjectRelationship');
        // Should not have made a PATCH call
        expect(getSpy().mock.calls.length).toBe(1);
      });

      it('should reject replace operation with singleton relationship value', async () => {
        mockGetConfig(basicObjects);

        const result = await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [
            {
              operation: 'replace',
              field: '/schema/properties/manager',
              value: {
                type: 'relationship',
                resourceCollection: [{ path: 'managed/alpha_user' }]
              }
            }
          ]
        });

        expect(result.content[0].text).toContain(
          "Operation 'replace' on field '/schema/properties/manager' targets a relationship property"
        );
        expect(result.content[0].text).toContain('patchManagedObjectRelationship');
      });

      it('should reject add operation with multi-valued relationship value', async () => {
        mockGetConfig(basicObjects);

        const result = await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [
            {
              operation: 'add',
              field: '/schema/properties/members',
              value: {
                type: 'array',
                items: {
                  type: 'relationship',
                  resourceCollection: [{ path: 'managed/bravo_role' }]
                }
              }
            }
          ]
        });

        expect(result.content[0].text).toContain('targets a relationship property');
        expect(result.content[0].text).toContain('patchManagedObjectRelationship');
      });

      it('should reject replace operation with multi-valued relationship value', async () => {
        mockGetConfig(basicObjects);

        const result = await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [
            {
              operation: 'replace',
              field: '/schema/properties/roles',
              value: {
                type: 'array',
                items: { type: 'relationship' }
              }
            }
          ]
        });

        expect(result.content[0].text).toContain('targets a relationship property');
        expect(result.content[0].text).toContain('patchManagedObjectRelationship');
      });

      it('should reject remove operation on existing singleton relationship property', async () => {
        mockGetConfig(basicObjects);

        const result = await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [{ operation: 'remove', field: '/schema/properties/manager' }]
        });

        expect(result.content[0].text).toContain(
          "Operation 'remove' on field '/schema/properties/manager' targets a relationship property"
        );
        expect(result.content[0].text).toContain('patchManagedObjectRelationship');
      });

      it('should reject remove operation on existing multi-valued relationship property', async () => {
        mockGetConfig(basicObjects);

        const result = await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [{ operation: 'remove', field: '/schema/properties/roles' }]
        });

        expect(result.content[0].text).toContain('targets a relationship property');
        expect(result.content[0].text).toContain('patchManagedObjectRelationship');
      });

      it('should allow remove operation on non-relationship property', async () => {
        mockGetConfig(basicObjects);

        await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [{ operation: 'remove', field: '/schema/properties/userName' }]
        });

        // Should have made both GET and PATCH calls
        const calls = getSpy().mock.calls;
        expect(calls.length).toBe(2);
        expect(calls[1][2]?.method).toBe('PATCH');
      });

      it('should allow add operation with non-relationship value', async () => {
        mockGetConfig(basicObjects);

        await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [
            { operation: 'add', field: '/schema/properties/phone', value: { type: 'string', title: 'Phone Number' } }
          ]
        });

        // Should have made both GET and PATCH calls
        const calls = getSpy().mock.calls;
        expect(calls.length).toBe(2);
      });

      it('should allow replace operation with non-relationship value', async () => {
        mockGetConfig(basicObjects);

        await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [
            {
              operation: 'replace',
              field: '/schema/properties/email',
              value: { type: 'string', title: 'Updated Email' }
            }
          ]
        });

        // Should have made both GET and PATCH calls
        expect(getSpy().mock.calls.length).toBe(2);
      });

      it('should allow add/replace with array type that is not a relationship', async () => {
        mockGetConfig(basicObjects);

        await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [
            {
              operation: 'add',
              field: '/schema/properties/tags',
              value: { type: 'array', items: { type: 'string' } }
            }
          ]
        });

        // Should proceed to PATCH
        expect(getSpy().mock.calls.length).toBe(2);
      });

      it('should allow remove on a field that does not exist in the config', async () => {
        mockGetConfig(basicObjects);

        await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [{ operation: 'remove', field: '/schema/properties/nonexistent' }]
        });

        // isExistingPropertyRelationship returns false for non-existent paths
        // so the operation is allowed (the API will handle the error)
        expect(getSpy().mock.calls.length).toBe(2);
      });

      it('should stop at first relationship operation and return error', async () => {
        mockGetConfig(basicObjects);

        const result = await patchManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user',
          operations: [
            { operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } },
            { operation: 'add', field: '/schema/properties/supervisor', value: { type: 'relationship' } },
            { operation: 'replace', field: '/schema/properties/userName', value: { type: 'string' } }
          ]
        });

        expect(result.content[0].text).toContain('targets a relationship property');
        // Should not have made a PATCH call
        expect(getSpy().mock.calls.length).toBe(1);
      });
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return confirmation with object name, operation count, and updated definition', async () => {
      const updatedUser = {
        ...basicObjects[0],
        schema: {
          ...basicObjects[0].schema,
          properties: {
            ...basicObjects[0].schema.properties,
            email: { type: 'string', title: 'Email' }
          }
        }
      };

      mockGetAndPatch(basicObjects, {
        _id: 'managed',
        objects: [updatedUser, basicObjects[1]]
      });

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [
          { operation: 'replace', field: '/schema/properties/email', value: { type: 'string', title: 'Email' } }
        ]
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.message).toContain("Patched managed object definition 'alpha_user'");
      expect(parsed.name).toBe('alpha_user');
      expect(parsed.operationsApplied).toBe(1);
      expect(parsed.definition).toEqual(updatedUser);
    });

    it('should not return other objects from the config in the response', async () => {
      mockGetAndPatch(basicObjects, {
        _id: 'managed',
        objects: basicObjects
      });

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      // Should contain the patched object but NOT other objects
      expect(parsed.definition.name).toBe('alpha_user');
      expect(text).not.toContain('"_id":"managed"');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept valid objectName with letters, numbers, and underscores', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('custom_Widget_123')).not.toThrow();
      expect(() => schema.parse('MyObject')).not.toThrow();
    });

    it('should reject objectName with special characters', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('my-object')).toThrow();
      expect(() => schema.parse('my.object')).toThrow();
      expect(() => schema.parse('my object')).toThrow();
      expect(() => schema.parse('my/object')).toThrow();
    });

    it('should reject empty objectName', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('')).toThrow();
    });

    it('should require operations array', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.operations;
      expect(schema).toBeDefined();
      expect(() => schema.parse([])).not.toThrow();
      expect(() => schema.parse([{ operation: 'replace', field: '/test', value: 'x' }])).not.toThrow();
    });

    it('should accept empty operations array', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.operations;
      expect(() => schema.parse([])).not.toThrow();
    });

    it('should validate operation enum values', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.operations;
      expect(() => schema.parse([{ operation: 'invalid', field: '/test', value: 'x' }])).toThrow();
      expect(() => schema.parse([{ operation: 'update', field: '/test', value: 'x' }])).toThrow();
      expect(() => schema.parse([{ operation: 'delete', field: '/test' }])).toThrow();
    });

    it('should accept all valid operation types', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.operations;
      expect(() => schema.parse([{ operation: 'add', field: '/test', value: 'x' }])).not.toThrow();
      expect(() => schema.parse([{ operation: 'remove', field: '/test' }])).not.toThrow();
      expect(() => schema.parse([{ operation: 'replace', field: '/test', value: 'x' }])).not.toThrow();
    });

    it('should reject move, copy, and test operations', () => {
      const schema = patchManagedObjectDefinitionTool.inputSchema.operations;
      expect(() => schema.parse([{ operation: 'move', field: '/test', value: '/other' }])).toThrow();
      expect(() => schema.parse([{ operation: 'copy', field: '/test', value: '/other' }])).toThrow();
      expect(() => schema.parse([{ operation: 'test', field: '/test', value: 'x' }])).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      {
        name: 'should handle 401 Unauthorized error on GET',
        handler: () =>
          server.use(
            http.get('https://*/openidm/config/managed', () => {
              return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
            })
          ),
        matcher: /401|[Uu]nauthorized/
      },
      {
        name: 'should handle 403 Forbidden error on PATCH',
        handler: () =>
          server.use(
            http.get('https://*/openidm/config/managed', () => {
              return HttpResponse.json({
                _id: 'managed',
                objects: [{ name: 'alpha_user', schema: { properties: { email: { type: 'string' } } } }]
              });
            }),
            http.patch('https://*/openidm/config/managed', () => {
              return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
            })
          ),
        matcher: /403|[Ff]orbidden/
      },
      {
        name: 'should handle 400 Bad Request error',
        handler: () =>
          server.use(
            http.get('https://*/openidm/config/managed', () => {
              return HttpResponse.json({
                _id: 'managed',
                objects: [{ name: 'alpha_user', schema: { properties: { email: { type: 'string' } } } }]
              });
            }),
            http.patch('https://*/openidm/config/managed', () => {
              return new HttpResponse(JSON.stringify({ error: 'bad_request' }), { status: 400 });
            })
          ),
        matcher: /400|[Bb]ad [Rr]equest/
      },
      {
        name: 'should handle 500 Internal Server Error',
        handler: () =>
          server.use(
            http.get('https://*/openidm/config/managed', () => {
              return HttpResponse.json({
                _id: 'managed',
                objects: [{ name: 'alpha_user', schema: { properties: { email: { type: 'string' } } } }]
              });
            }),
            http.patch('https://*/openidm/config/managed', () => {
              return new HttpResponse(JSON.stringify({ error: 'internal_error' }), { status: 500 });
            })
          ),
        matcher: /500|[Ii]nternal/
      }
    ])('$name', async ({ handler, matcher }) => {
      handler();

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      expect(result.content[0].text).toContain('Failed to patch managed object definition');
      expect(result.content[0].text).toMatch(matcher);
    });

    it('should handle network error', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.error();
        })
      );

      const result = await patchManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        operations: [{ operation: 'replace', field: '/schema/properties/email', value: { type: 'string' } }]
      });

      expect(result.content[0].text).toContain('Failed to patch managed object definition');
    });
  });
});
