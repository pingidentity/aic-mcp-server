import { describe, it, expect } from 'vitest';
import { patchManagedObjectRelationshipTool } from '../../../src/tools/managedObjects/patchManagedObjectRelationship.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('patchManagedObjectRelationship', () => {
  const getSpy = setupTestEnvironment();

  const sampleRelationshipDefinition = {
    description: null,
    title: 'Custom_department',
    viewable: true,
    searchable: false,
    userEditable: false,
    returnByDefault: false,
    type: 'relationship',
    reverseRelationship: false,
    reversePropertyName: null,
    validate: true,
    notifySelf: false,
    properties: {
      _ref: { type: 'string' },
      _refProperties: {
        type: 'object',
        properties: {
          _id: { type: 'string', required: false, propName: '_id' }
        }
      }
    },
    resourceCollection: [
      {
        path: 'managed/alpha_user',
        label: 'Alpha_user',
        query: { queryFilter: 'true', fields: ['_id'], sortKeys: [] },
        notify: false
      }
    ],
    required: false
  };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('patchManagedObjectRelationship', patchManagedObjectRelationshipTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should send PUT to schema service URL for add action', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe(
        'https://test.forgeblocks.com/openidm/schema/managed/alpha_user/properties/custom_department'
      );
      expect(calls[0][2]?.method).toBe('PUT');
    });

    it('should send PUT to schema service URL for update action', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'update',
        propertyDefinition: sampleRelationshipDefinition
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe(
        'https://test.forgeblocks.com/openidm/schema/managed/alpha_user/properties/custom_department'
      );
      expect(calls[0][2]?.method).toBe('PUT');
    });

    it('should send DELETE to schema service URL for remove action', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'bravo_role',
        propertyName: 'custom_teams',
        action: 'remove'
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe(
        'https://test.forgeblocks.com/openidm/schema/managed/bravo_role/properties/custom_teams'
      );
      expect(calls[0][2]?.method).toBe('DELETE');
    });

    it('should include Accept-API-Version header for PUT', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      expect(requestOptions.headers['Accept-API-Version']).toBe('resource=2.0');
    });

    it('should include Accept-API-Version header for DELETE', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'remove'
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      expect(requestOptions.headers['Accept-API-Version']).toBe('resource=2.0');
    });

    it('should include If-Match: * header for PUT', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      expect(requestOptions.headers['If-Match']).toBe('*');
    });

    it('should include If-Match: * header for DELETE', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'remove'
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      expect(requestOptions.headers['If-Match']).toBe('*');
    });

    it('should send propertyDefinition as request body for PUT', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      const requestBody = JSON.parse(requestOptions.body);
      expect(requestBody).toEqual(sampleRelationshipDefinition);
    });

    it('should not send body for DELETE', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'remove'
      });

      const callArgs = getSpy().mock.calls[0];
      const requestOptions = callArgs[2];
      expect(requestOptions.body).toBeUndefined();
    });

    it('should pass correct scopes to auth', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      expect(getSpy()).toHaveBeenCalledWith(expect.any(String), ['fr:idm:*'], expect.anything());
    });
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should return error when add action is missing propertyDefinition', async () => {
      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add'
      });

      expect(result.content[0].text).toContain("'propertyDefinition' parameter is required");
      expect(result.content[0].text).toContain("'add' action");
      // Should not have made any API call
      expect(getSpy().mock.calls.length).toBe(0);
    });

    it('should return error when update action is missing propertyDefinition', async () => {
      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'update'
      });

      expect(result.content[0].text).toContain("'propertyDefinition' parameter is required");
      expect(result.content[0].text).toContain("'update' action");
      // Should not have made any API call
      expect(getSpy().mock.calls.length).toBe(0);
    });

    it('should allow remove action without propertyDefinition', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'remove'
      });

      // Should have made the DELETE call
      expect(getSpy().mock.calls.length).toBe(1);
      expect(getSpy().mock.calls[0][2]?.method).toBe('DELETE');
    });

    it('should allow remove action with propertyDefinition (ignored)', async () => {
      await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'remove',
        propertyDefinition: sampleRelationshipDefinition
      });

      // Should still make DELETE call
      expect(getSpy().mock.calls.length).toBe(1);
      expect(getSpy().mock.calls[0][2]?.method).toBe('DELETE');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return confirmation with property name and object type for add', async () => {
      server.use(
        http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json(body);
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.message).toContain("Added relationship property 'custom_department'");
      expect(parsed.message).toContain("'alpha_user'");
      expect(parsed.objectType).toBe('alpha_user');
      expect(parsed.propertyName).toBe('custom_department');
    });

    it('should return confirmation with Updated message for update action', async () => {
      server.use(
        http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', async ({ request }) => {
          const body = (await request.json()) as Record<string, any>;
          return HttpResponse.json(body);
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'update',
        propertyDefinition: sampleRelationshipDefinition
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.message).toContain("Updated relationship property 'custom_department'");
    });

    it('should return the definition from the API response for add/update', async () => {
      const apiResponse = { ...sampleRelationshipDefinition, _id: 'custom_department' };
      server.use(
        http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
          return HttpResponse.json(apiResponse);
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.definition).toEqual(apiResponse);
    });

    it('should return confirmation for remove action', async () => {
      server.use(
        http.delete('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
          return new HttpResponse(null, { status: 204, headers: { 'content-length': '0' } });
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'remove'
      });

      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.message).toContain("Removed relationship property 'custom_department'");
      expect(parsed.message).toContain("'alpha_user'");
      expect(parsed.objectType).toBe('alpha_user');
      expect(parsed.propertyName).toBe('custom_department');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should accept valid objectType values', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('bravo_role')).not.toThrow();
      expect(() => schema.parse('custom_object123')).not.toThrow();
    });

    it('should reject objectType with path traversal characters', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.objectType;
      expect(() => schema.parse('../etc')).toThrow();
      expect(() => schema.parse('path/segment')).toThrow();
      expect(() => schema.parse('path\\segment')).toThrow();
    });

    it('should reject empty objectType', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.objectType;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept propertyName with custom_ prefix', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      expect(() => schema.parse('custom_department')).not.toThrow();
      expect(() => schema.parse('custom_teams')).not.toThrow();
      expect(() => schema.parse('custom_my_relationship')).not.toThrow();
    });

    it('should reject propertyName without custom_ prefix', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      expect(() => schema.parse('department')).toThrow();
      expect(() => schema.parse('manager')).toThrow();
      expect(() => schema.parse('roles')).toThrow();
    });

    it('should reject propertyName that contains custom_ but does not start with it', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      expect(() => schema.parse('my_custom_field')).toThrow();
    });

    it('should reject empty propertyName', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      expect(() => schema.parse('')).toThrow();
    });

    it('should reject propertyName with path traversal characters', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyName;
      expect(() => schema.parse('custom_../bad')).toThrow();
      expect(() => schema.parse('custom_path/bad')).toThrow();
    });

    it('should accept valid action values', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.action;
      expect(schema.parse('add')).toBe('add');
      expect(schema.parse('update')).toBe('update');
      expect(schema.parse('remove')).toBe('remove');
    });

    it('should reject invalid action values', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.action;
      expect(() => schema.parse('delete')).toThrow();
      expect(() => schema.parse('create')).toThrow();
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept propertyDefinition as a record', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyDefinition;
      expect(() => schema.parse(sampleRelationshipDefinition)).not.toThrow();
      expect(() => schema.parse({ type: 'relationship' })).not.toThrow();
    });

    it('should allow propertyDefinition to be undefined (optional)', () => {
      const schema = patchManagedObjectRelationshipTool.inputSchema.propertyDefinition;
      expect(() => schema.parse(undefined)).not.toThrow();
    });
  });

  // ===== TOOL ANNOTATIONS TESTS =====
  describe('Tool Annotations', () => {
    it('should have destructiveHint set to true', () => {
      expect(patchManagedObjectRelationshipTool.annotations.destructiveHint).toBe(true);
    });

    it('should have openWorldHint set to true', () => {
      expect(patchManagedObjectRelationshipTool.annotations.openWorldHint).toBe(true);
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 400 Bad Request with informative message', async () => {
      server.use(
        http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad_request', message: 'Invalid property definition' }), {
            status: 400
          });
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: { invalid: true }
      });

      expect(result.content[0].text).toContain("Failed to add relationship property 'custom_department'");
      expect(result.content[0].text).toContain('bad request');
      expect(result.content[0].text).toMatch(/400|[Bb]ad/);
    });

    it('should handle 404 Not Found with informative message', async () => {
      server.use(
        http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found', message: 'Object type not found' }), {
            status: 404
          });
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'nonexistent_type',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      expect(result.content[0].text).toContain("Failed to add relationship property 'custom_department'");
      expect(result.content[0].text).toContain('not found');
      expect(result.content[0].text).toContain('nonexistent_type');
    });

    it('should handle 404 on DELETE with informative message', async () => {
      server.use(
        http.delete('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
          return new HttpResponse(JSON.stringify({ error: 'not_found', message: 'Property not found' }), {
            status: 404
          });
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_nonexistent',
        action: 'remove'
      });

      expect(result.content[0].text).toContain("Failed to remove relationship property 'custom_nonexistent'");
      expect(result.content[0].text).toContain('not found');
    });

    it.each([
      {
        name: 'should handle 401 Unauthorized error',
        handler: () =>
          server.use(
            http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
              return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
            })
          ),
        matcher: /401|[Uu]nauthorized/
      },
      {
        name: 'should handle 403 Forbidden error',
        handler: () =>
          server.use(
            http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
              return new HttpResponse(JSON.stringify({ error: 'forbidden' }), { status: 403 });
            })
          ),
        matcher: /403|[Ff]orbidden/
      },
      {
        name: 'should handle 500 Internal Server Error',
        handler: () =>
          server.use(
            http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
              return new HttpResponse(JSON.stringify({ error: 'internal_error' }), { status: 500 });
            })
          ),
        matcher: /500|[Ii]nternal/
      }
    ])('$name', async ({ handler, matcher }) => {
      handler();

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      expect(result.content[0].text).toContain("Failed to add relationship property 'custom_department'");
      expect(result.content[0].text).toMatch(matcher);
    });

    it('should handle network error', async () => {
      server.use(
        http.put('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
          return HttpResponse.error();
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'add',
        propertyDefinition: sampleRelationshipDefinition
      });

      expect(result.content[0].text).toContain("Failed to add relationship property 'custom_department'");
    });

    it('should handle network error on DELETE', async () => {
      server.use(
        http.delete('https://*/openidm/schema/managed/:objectType/properties/:propertyName', () => {
          return HttpResponse.error();
        })
      );

      const result = await patchManagedObjectRelationshipTool.toolFunction({
        objectType: 'alpha_user',
        propertyName: 'custom_department',
        action: 'remove'
      });

      expect(result.content[0].text).toContain("Failed to remove relationship property 'custom_department'");
    });
  });
});
