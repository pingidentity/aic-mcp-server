import { describe, it, expect } from 'vitest';
import { createManagedObjectDefinitionTool } from '../../../src/tools/managedObjects/createManagedObjectDefinition.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('createManagedObjectDefinition', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createManagedObjectDefinition', createManagedObjectDefinitionTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should GET config/managed first to check for duplicates', async () => {
      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toBe('https://test.forgeblocks.com/openidm/config/managed');
      // First call should be GET (no options or no method specified)
      expect(calls[0][2]).toBeUndefined();
    });

    it('should send PATCH to config/managed with correct URL', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: []
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1][0]).toBe('https://test.forgeblocks.com/openidm/config/managed');
      expect(calls[1][2]?.method).toBe('PATCH');
    });

    it('should add If-Match header with wildcard', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: []
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      const callArgs = getSpy().mock.calls[1];
      const requestOptions = callArgs[2];
      expect(requestOptions.headers['If-Match']).toBe('*');
    });

    it('should send PATCH body with add operation to /objects/-', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: []
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: {
          schema: {
            properties: { widgetName: { type: 'string' } }
          }
        }
      });

      const callArgs = getSpy().mock.calls[1];
      const requestOptions = callArgs[2];
      const requestBody = JSON.parse(requestOptions.body);

      expect(requestBody).toEqual([
        {
          operation: 'add',
          field: '/objects/-',
          value: {
            name: 'custom_widget',
            schema: {
              properties: { widgetName: { type: 'string' } }
            }
          }
        }
      ]);
    });

    it('should merge objectName into objectDefinition as name field', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: []
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_device',
        objectDefinition: {
          schema: { properties: { deviceId: { type: 'string' } } },
          onCreate: { type: 'text/javascript', source: '' }
        }
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);

      // name should be first (spread after name in value object)
      expect(requestBody[0].value.name).toBe('alpha_device');
      expect(requestBody[0].value.schema).toBeDefined();
      expect(requestBody[0].value.onCreate).toBeDefined();
    });

    it('should not allow objectDefinition.name to override validated objectName', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: []
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: {
          name: 'malicious_name',
          schema: { properties: { widgetName: { type: 'string' } } }
        }
      });

      const callArgs = getSpy().mock.calls[1];
      const requestBody = JSON.parse(callArgs[2].body);

      // The validated objectName should always win over objectDefinition.name
      expect(requestBody[0].value.name).toBe('custom_widget');
      expect(requestBody[0].value.name).not.toBe('malicious_name');
    });

    it('should pass correct scopes to auth', async () => {
      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      expect(getSpy()).toHaveBeenCalledWith(expect.any(String), ['fr:idm:*'], expect.anything());
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should reject if objectName already exists in config', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [
              { name: 'alpha_user', schema: { properties: {} } },
              { name: 'bravo_role', schema: { properties: {} } }
            ]
          });
        })
      );

      const result = await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'alpha_user',
        objectDefinition: { schema: { properties: {} } }
      });

      expect(result.content[0].text).toContain("Managed object type 'alpha_user' already exists");
      expect(result.content[0].text).toContain('patchManagedObjectDefinition');
      // Should not have made a PATCH call
      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(1); // Only the GET
    });

    it('should allow creation when objectName does not exist in config', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [{ name: 'alpha_user', schema: { properties: {} } }]
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      // Should have made both GET and PATCH calls
      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[1][2]?.method).toBe('PATCH');
    });

    it('should handle empty objects array in config', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: []
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      // Should proceed to PATCH
      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
    });

    it('should handle missing objects array in config', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed'
          });
        })
      );

      await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      // Should proceed to PATCH (no collision possible)
      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return confirmation with object name', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: []
          });
        }),
        http.patch('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [
              {
                name: 'custom_widget',
                schema: { properties: { widgetName: { type: 'string' } } }
              }
            ]
          });
        })
      );

      const result = await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: { widgetName: { type: 'string' } } } }
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.message).toContain("Created managed object definition 'custom_widget'");
      expect(parsed.name).toBe('custom_widget');
    });

    it('should return the newly added object definition in the response', async () => {
      const newDefinition = {
        name: 'custom_widget',
        schema: {
          properties: {
            widgetName: { type: 'string' },
            widgetSize: { type: 'integer' }
          }
        }
      };

      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: []
          });
        }),
        http.patch('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [newDefinition]
          });
        })
      );

      const result = await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: {
          schema: {
            properties: {
              widgetName: { type: 'string' },
              widgetSize: { type: 'integer' }
            }
          }
        }
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.definition).toEqual(newDefinition);
    });

    it('should not return the full config in the response', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [{ name: 'alpha_user', schema: { properties: {} } }]
          });
        }),
        http.patch('https://*/openidm/config/managed', () => {
          return HttpResponse.json({
            _id: 'managed',
            objects: [
              { name: 'alpha_user', schema: { properties: {} } },
              { name: 'custom_widget', schema: { properties: {} } }
            ]
          });
        })
      );

      const result = await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      const text = result.content[0].text;
      // Should NOT contain alpha_user (that's the existing object, not the new one)
      expect(text).not.toContain('alpha_user');
      expect(text).toContain('custom_widget');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept valid objectName with letters, numbers, and underscores', () => {
      const schema = createManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('custom_Widget_123')).not.toThrow();
      expect(() => schema.parse('MyObject')).not.toThrow();
    });

    it('should reject objectName with special characters', () => {
      const schema = createManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('my-object')).toThrow();
      expect(() => schema.parse('my.object')).toThrow();
      expect(() => schema.parse('my object')).toThrow();
      expect(() => schema.parse('my/object')).toThrow();
    });

    it('should reject empty objectName', () => {
      const schema = createManagedObjectDefinitionTool.inputSchema.objectName;
      expect(() => schema.parse('')).toThrow();
    });

    it('should require objectDefinition as a record', () => {
      const schema = createManagedObjectDefinitionTool.inputSchema.objectDefinition;
      expect(() => schema.parse(undefined)).toThrow();
      expect(() => schema.parse({ schema: { properties: {} } })).not.toThrow();
    });

    it('should accept objectDefinition with any structure', () => {
      const schema = createManagedObjectDefinitionTool.inputSchema.objectDefinition;
      expect(() =>
        schema.parse({
          schema: { properties: { field: { type: 'string' } } },
          onCreate: { type: 'text/javascript', source: '' },
          customField: 'value'
        })
      ).not.toThrow();
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
              return HttpResponse.json({ _id: 'managed', objects: [] });
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
              return HttpResponse.json({ _id: 'managed', objects: [] });
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
              return HttpResponse.json({ _id: 'managed', objects: [] });
            }),
            http.patch('https://*/openidm/config/managed', () => {
              return new HttpResponse(JSON.stringify({ error: 'internal_error' }), { status: 500 });
            })
          ),
        matcher: /500|[Ii]nternal/
      }
    ])('$name', async ({ handler, matcher }) => {
      handler();

      const result = await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      expect(result.content[0].text).toContain('Failed to create managed object definition');
      expect(result.content[0].text).toMatch(matcher);
    });

    it('should handle network error', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.error();
        })
      );

      const result = await createManagedObjectDefinitionTool.toolFunction({
        objectName: 'custom_widget',
        objectDefinition: { schema: { properties: {} } }
      });

      expect(result.content[0].text).toContain('Failed to create managed object definition');
    });
  });
});
