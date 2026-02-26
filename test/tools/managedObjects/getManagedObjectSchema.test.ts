import { describe, it, expect } from 'vitest';
import { getManagedObjectSchemaTool } from '../../../src/tools/managedObjects/getManagedObjectSchema.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('getManagedObjectSchema', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getManagedObjectSchema', getManagedObjectSchemaTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL and scopes', async () => {
      await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      expect(getSpy()).toHaveBeenCalledWith('https://test.forgeblocks.com/openidm/config/managed', ['fr:idm:*']);
    });
  });

  // ===== RESPONSE PROCESSING TESTS (Application Logic) =====
  describe('Response Processing', () => {
    it('should extract specific object from config array', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request: _request }) => {
          return HttpResponse.json({
            objects: [
              { name: 'alpha_user', schema: { required: ['userName'], properties: { userName: { type: 'string' } } } },
              { name: 'bravo_user', schema: { required: ['username'], properties: { username: { type: 'string' } } } }
            ]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      const resultText = result.content[0].text;
      expect(resultText).toContain('alpha_user');
      expect(resultText).toContain('userName');
      expect(resultText).not.toContain('bravo_user');
      expect(resultText).not.toContain('username');
    });

    it('should extract only essential schema fields', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request: _request }) => {
          return HttpResponse.json({
            objects: [
              {
                name: 'alpha_user',
                schema: {
                  required: ['userName'],
                  properties: { userName: { type: 'string' } }
                },
                other_fields: 'should not appear',
                _id: 'should not appear',
                description: 'should not appear'
              }
            ]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      const resultText = result.content[0].text;
      const parsedResult = JSON.parse(resultText);

      expect(Object.keys(parsedResult)).toEqual(['name', 'required', 'properties']);
      expect(parsedResult.name).toBe('alpha_user');
      expect(parsedResult.required).toEqual(['userName']);
      expect(parsedResult.properties).toEqual({ userName: { type: 'string' } });

      expect(parsedResult).not.toHaveProperty('other_fields');
      expect(parsedResult).not.toHaveProperty('_id');
      expect(parsedResult).not.toHaveProperty('description');
    });

    it('should handle missing required array', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request: _request }) => {
          return HttpResponse.json({
            objects: [
              {
                name: 'alpha_user',
                schema: {
                  properties: { userName: { type: 'string' } }
                }
              }
            ]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      const resultText = result.content[0].text;
      const parsedResult = JSON.parse(resultText);

      expect(parsedResult.required).toEqual([]);
    });

    it('should handle missing properties object', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request: _request }) => {
          return HttpResponse.json({
            objects: [
              {
                name: 'alpha_user',
                schema: {
                  required: ['userName']
                }
              }
            ]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      const resultText = result.content[0].text;
      const parsedResult = JSON.parse(resultText);

      expect(parsedResult.properties).toEqual({});
    });

    it('should return error when objectType not found in config', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request: _request }) => {
          return HttpResponse.json({
            objects: [
              { name: 'bravo_user', schema: { required: [], properties: {} } },
              { name: 'alpha_role', schema: { required: [], properties: {} } }
            ]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      const resultText = result.content[0].text;

      expect(resultText).toContain('not found');
      expect(resultText).toContain('alpha_user');
      expect(resultText).toContain('Available types');
      expect(resultText).toContain('bravo_user');
      expect(resultText).toContain('alpha_role');
    });

    it('should handle missing objects array in config', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request: _request }) => {
          return HttpResponse.json({});
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      const resultText = result.content[0].text;

      expect(resultText).toContain('not found');
      expect(resultText).toContain('alpha_user');
      expect(resultText).toContain('Available types');
      expect(resultText).toContain('none');
    });

    it('should handle missing schema object', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request: _request }) => {
          return HttpResponse.json({
            objects: [
              {
                name: 'alpha_user'
              }
            ]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      const resultText = result.content[0].text;
      const parsedResult = JSON.parse(resultText);

      expect(parsedResult.name).toBe('alpha_user');
      expect(parsedResult.required).toEqual([]);
      expect(parsedResult.properties).toEqual({});
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should reject empty objectType string', () => {
      const schema = getManagedObjectSchemaTool.inputSchema.objectType;
      expect(() => schema.parse('')).toThrow();
    });

    it('should accept standard object types', () => {
      const schema = getManagedObjectSchemaTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_user')).not.toThrow();
      expect(() => schema.parse('bravo_group')).not.toThrow();
    });

    it('should accept any non-empty object type string', () => {
      const schema = getManagedObjectSchemaTool.inputSchema.objectType;
      expect(() => schema.parse('alpha_device')).not.toThrow();
      expect(() => schema.parse('custom_application')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      {
        name: 'should handle 401 Unauthorized error',
        status: 401,
        body: { error: 'unauthorized', message: 'Token expired' },
        matcher: /401|unauthorized/i
      },
      {
        name: 'should handle 500 Internal Server Error',
        status: 500,
        body: { error: 'internal_error', message: 'Server error' },
        matcher: /500|internal_error/i
      }
    ])('$name', async ({ status, body, matcher }) => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user'
      });

      const resultText = result.content[0].text;
      expect(resultText).toContain('Failed to retrieve managed object schema');
      expect(resultText).toMatch(matcher);
    });
  });
});
