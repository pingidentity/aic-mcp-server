import { describe, it, expect } from 'vitest';
import { deleteManagedObjectDefinitionTool } from '../../../src/tools/managedObjects/deleteManagedObjectDefinition.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { mockGetConfig, mockGetAndPut } from '../../helpers/managedConfigMocks.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteManagedObjectDefinition', () => {
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
          name: { type: 'string' },
          members: {
            type: 'array',
            items: {
              type: 'relationship',
              resourceCollection: [{ path: 'managed/alpha_user' }]
            }
          }
        }
      }
    },
    {
      name: 'charlie_device',
      schema: {
        properties: {
          deviceId: { type: 'string' },
          manufacturer: { type: 'string' }
        }
      }
    }
  ];

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteManagedObjectDefinition', deleteManagedObjectDefinitionTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should GET config/managed first to find array index', async () => {
      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/openidm/config/managed');
      // First call should be GET (no options or no method specified)
      expect(calls[0][2]).toBeUndefined();
    });

    it('should send PUT to config/managed with correct URL', async () => {
      mockGetConfig(basicObjects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1][0]).toBe('https://test.forgeblocks.com/openidm/config/managed');
      expect(calls[1][2]?.method).toBe('PUT');
    });

    it('should add If-Match header with wildcard', async () => {
      mockGetConfig(basicObjects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      const callArgs = getSpy().mock.calls[1];
      const requestOptions = callArgs[2];
      expect(requestOptions.headers['If-Match']).toBe('*');
    });

    it('should PUT full config with target object filtered out', async () => {
      mockGetConfig(basicObjects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);

      expect(requestBody.objects).toHaveLength(2);
      expect(requestBody.objects.map((o: any) => o.name)).toEqual(['alpha_user', 'bravo_role']);
    });

    it('should filter by name regardless of array position', async () => {
      mockGetConfig([
        { name: 'alpha_user', schema: { properties: { userName: { type: 'string' } } } },
        { name: 'bravo_role', schema: { properties: { name: { type: 'string' } } } }
      ]);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user'
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);

      expect(requestBody.objects).toHaveLength(1);
      expect(requestBody.objects[0].name).toBe('bravo_role');
    });

    it('should pass correct scopes to auth', async () => {
      mockGetConfig(basicObjects);

      await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      // Both GET and PUT calls should use the correct scopes
      const calls = getSpy().mock.calls;
      expect(calls[0][1]).toEqual(['fr:idm:*']);
      expect(calls[1][1]).toEqual(['fr:idm:*']);
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should return error if objectName not found in config', async () => {
      mockGetConfig(basicObjects);

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'nonexistent_type'
      });

      expect(result.content[0].text).toContain("Managed object type 'nonexistent_type' not found");
      expect(result.content[0].text).toContain('alpha_user');
      expect(result.content[0].text).toContain('bravo_role');
      expect(result.content[0].text).toContain('charlie_device');
      // Should not have made a PUT call
      expect(getSpy().mock.calls.length).toBe(1); // Only the GET
    });

    it('should return error listing available types when objectName not found', async () => {
      mockGetConfig(basicObjects);

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'nonexistent'
      });

      expect(result.content[0].text).toContain('Available types: alpha_user, bravo_role, charlie_device');
    });

    it('should handle empty objects array', async () => {
      mockGetConfig([]);

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user'
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

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user'
      });

      expect(result.content[0].text).toContain("Managed object type 'alpha_user' not found");
    });

    // --- Reference Checking ---
    describe('Reference Checking', () => {
      it('should block deletion if a singleton relationship references the target', async () => {
        const objects = [
          {
            name: 'alpha_user',
            schema: {
              properties: {
                userName: { type: 'string' },
                department: {
                  type: 'relationship',
                  resourceCollection: [{ path: 'managed/bravo_department' }]
                }
              }
            }
          },
          {
            name: 'bravo_department',
            schema: {
              properties: {
                name: { type: 'string' }
              }
            }
          }
        ];

        mockGetConfig(objects);

        const result = await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'bravo_department'
        });

        expect(result.content[0].text).toContain("Cannot delete managed object type 'bravo_department'");
        expect(result.content[0].text).toContain('alpha_user');
        expect(result.content[0].text).toContain('department');
        expect(result.content[0].text).toContain('patchManagedObjectRelationship');
        // Should not have made a PUT call
        expect(getSpy().mock.calls.length).toBe(1);
      });

      it('should block deletion if a multi-valued relationship references the target', async () => {
        mockGetConfig(basicObjects);

        // bravo_role is referenced by alpha_user's roles property (array relationship)
        const result = await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'bravo_role'
        });

        expect(result.content[0].text).toContain("Cannot delete managed object type 'bravo_role'");
        expect(result.content[0].text).toContain('alpha_user');
        expect(result.content[0].text).toContain('roles');
      });

      it('should block deletion listing all referencing objects and properties', async () => {
        const objects = [
          {
            name: 'alpha_user',
            schema: {
              properties: {
                department: {
                  type: 'relationship',
                  resourceCollection: [{ path: 'managed/target_object' }]
                },
                teams: {
                  type: 'array',
                  items: {
                    type: 'relationship',
                    resourceCollection: [{ path: 'managed/target_object' }]
                  }
                }
              }
            }
          },
          {
            name: 'bravo_role',
            schema: {
              properties: {
                linkedObject: {
                  type: 'relationship',
                  resourceCollection: [{ path: 'managed/target_object' }]
                }
              }
            }
          },
          {
            name: 'target_object',
            schema: {
              properties: {
                name: { type: 'string' }
              }
            }
          }
        ];

        mockGetConfig(objects);

        const result = await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'target_object'
        });

        expect(result.content[0].text).toContain("Cannot delete managed object type 'target_object'");
        expect(result.content[0].text).toContain('alpha_user');
        expect(result.content[0].text).toContain('department');
        expect(result.content[0].text).toContain('teams');
        expect(result.content[0].text).toContain('bravo_role');
        expect(result.content[0].text).toContain('linkedObject');
      });

      it('should allow deletion when no references exist', async () => {
        mockGetConfig(basicObjects);

        // charlie_device has no references from other objects
        await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'charlie_device'
        });

        // Should have made both GET and PUT calls
        const calls = getSpy().mock.calls;
        expect(calls.length).toBe(2);
        expect(calls[1][2]?.method).toBe('PUT');
      });

      it('should not consider self-references as blocking', async () => {
        // alpha_user has a manager relationship that references managed/alpha_user (itself)
        // but this should NOT block deletion — only OTHER objects' references should block
        const objects = [
          {
            name: 'alpha_user',
            schema: {
              properties: {
                manager: {
                  type: 'relationship',
                  resourceCollection: [{ path: 'managed/alpha_user' }]
                }
              }
            }
          }
        ];

        mockGetConfig(objects);

        await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'alpha_user'
        });

        // Should proceed to PUT since the only reference is from itself
        const calls = getSpy().mock.calls;
        expect(calls.length).toBe(2);
        expect(calls[1][2]?.method).toBe('PUT');
      });

      it('should ignore objects without schema properties', async () => {
        const objects = [
          {
            name: 'alpha_user',
            schema: {}
          },
          {
            name: 'bravo_role'
            // no schema at all
          },
          {
            name: 'target_object',
            schema: {
              properties: {
                name: { type: 'string' }
              }
            }
          }
        ];

        mockGetConfig(objects);

        await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'target_object'
        });

        // Should proceed to PUT
        const calls = getSpy().mock.calls;
        expect(calls.length).toBe(2);
      });

      it('should not flag non-matching resourceCollection paths', async () => {
        const objects = [
          {
            name: 'alpha_user',
            schema: {
              properties: {
                manager: {
                  type: 'relationship',
                  resourceCollection: [{ path: 'managed/bravo_role' }]
                }
              }
            }
          },
          {
            name: 'charlie_device',
            schema: {
              properties: {
                deviceId: { type: 'string' }
              }
            }
          }
        ];

        mockGetConfig(objects);

        // charlie_device is not referenced by alpha_user's manager (which references bravo_role)
        await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'charlie_device'
        });

        // Should proceed to PUT
        const calls = getSpy().mock.calls;
        expect(calls.length).toBe(2);
      });

      it('should handle relationship properties with empty resourceCollection', async () => {
        const objects = [
          {
            name: 'alpha_user',
            schema: {
              properties: {
                manager: {
                  type: 'relationship',
                  resourceCollection: []
                }
              }
            }
          },
          {
            name: 'target_object',
            schema: {
              properties: {
                name: { type: 'string' }
              }
            }
          }
        ];

        mockGetConfig(objects);

        await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'target_object'
        });

        // Should proceed to PUT
        const calls = getSpy().mock.calls;
        expect(calls.length).toBe(2);
      });

      it('should handle relationship properties with multiple resourceCollection entries', async () => {
        const objects = [
          {
            name: 'alpha_user',
            schema: {
              properties: {
                linkedEntity: {
                  type: 'relationship',
                  resourceCollection: [{ path: 'managed/bravo_role' }, { path: 'managed/target_object' }]
                }
              }
            }
          },
          {
            name: 'target_object',
            schema: {
              properties: {
                name: { type: 'string' }
              }
            }
          }
        ];

        mockGetConfig(objects);

        const result = await deleteManagedObjectDefinitionTool.toolFunction({
          objectName: 'target_object'
        });

        expect(result.content[0].text).toContain("Cannot delete managed object type 'target_object'");
        expect(result.content[0].text).toContain('alpha_user');
        expect(result.content[0].text).toContain('linkedEntity');
      });
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return confirmation with object name and removed definition', async () => {
      mockGetAndPut(basicObjects, {
        _id: 'managed',
        objects: [basicObjects[0], basicObjects[1]]
      });

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.message).toContain("Deleted managed object definition 'charlie_device'");
      expect(parsed.name).toBe('charlie_device');
      expect(parsed.removedDefinition).toEqual(basicObjects[2]);
    });

    it('should not return the full config in the response', async () => {
      mockGetAndPut(basicObjects, {
        _id: 'managed',
        objects: [basicObjects[0], basicObjects[1]]
      });

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      const text = result.content[0].text;
      // Should NOT contain the other objects
      expect(text).not.toContain('alpha_user');
      expect(text).not.toContain('bravo_role');
      expect(text).toContain('charlie_device');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept valid objectName with letters, numbers, and underscores', () => {
      const schema = deleteManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('custom_Widget_123')).not.toThrow();
      expect(() => schema.parse('MyObject')).not.toThrow();
    });

    it('should reject objectName with special characters', () => {
      const schema = deleteManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('my-object')).toThrow();
      expect(() => schema.parse('my.object')).toThrow();
      expect(() => schema.parse('my object')).toThrow();
      expect(() => schema.parse('my/object')).toThrow();
    });

    it('should reject empty objectName', () => {
      const schema = deleteManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('')).toThrow();
    });
  });

  // ===== TOOL ANNOTATIONS TESTS =====
  describe('Tool Annotations', () => {
    it('should have destructiveHint set to true', () => {
      expect(deleteManagedObjectDefinitionTool.annotations.destructiveHint).toBe(true);
    });

    it('should have openWorldHint set to true', () => {
      expect(deleteManagedObjectDefinitionTool.annotations.openWorldHint).toBe(true);
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
        name: 'should handle 403 Forbidden error on PUT',
        handler: () =>
          server.use(
            http.get('https://*/openidm/config/managed', () => {
              return HttpResponse.json({
                _id: 'managed',
                objects: [
                  {
                    name: 'charlie_device',
                    schema: { properties: { deviceId: { type: 'string' } } }
                  }
                ]
              });
            }),
            http.put('https://*/openidm/config/managed', () => {
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
                objects: [
                  {
                    name: 'charlie_device',
                    schema: { properties: { deviceId: { type: 'string' } } }
                  }
                ]
              });
            }),
            http.put('https://*/openidm/config/managed', () => {
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
                objects: [
                  {
                    name: 'charlie_device',
                    schema: { properties: { deviceId: { type: 'string' } } }
                  }
                ]
              });
            }),
            http.put('https://*/openidm/config/managed', () => {
              return new HttpResponse(JSON.stringify({ error: 'internal_error' }), { status: 500 });
            })
          ),
        matcher: /500|[Ii]nternal/
      }
    ])('$name', async ({ handler, matcher }) => {
      handler();

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      expect(result.content[0].text).toContain('Failed to delete managed object definition');
      expect(result.content[0].text).toMatch(matcher);
    });

    it('should handle network error', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.error();
        })
      );

      const result = await deleteManagedObjectDefinitionTool.toolFunction({
        objectName: 'charlie_device'
      });

      expect(result.content[0].text).toContain('Failed to delete managed object definition');
    });
  });
});
