import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getManagedObjectSchemaTool } from '../../../src/tools/managedObjects/getManagedObjectSchema.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('getManagedObjectSchema', () => {
  let makeAuthenticatedRequestSpy: any;

  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    makeAuthenticatedRequestSpy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
  });

  afterEach(() => {
    makeAuthenticatedRequestSpy.mockRestore();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getManagedObjectSchema', getManagedObjectSchemaTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct correct URL', async () => {
      await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/openidm/config/managed',
        expect.any(Array)
      );
    });

    it('should pass correct scopes to auth', async () => {
      await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idm:*']
      );
    });
  });

  // ===== RESPONSE PROCESSING TESTS (Application Logic) =====
  describe('Response Processing', () => {
    it('should extract specific object from config array', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return HttpResponse.json({
            objects: [
              { name: 'alpha_user', schema: { required: ['userName'], properties: { userName: { type: 'string' } } } },
              { name: 'bravo_user', schema: { required: ['username'], properties: { username: { type: 'string' } } } }
            ]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
      });

      const resultText = result.content[0].text;
      expect(resultText).toContain('alpha_user');
      expect(resultText).toContain('userName');
      expect(resultText).not.toContain('bravo_user');
      expect(resultText).not.toContain('username');
    });

    it('should extract only essential schema fields', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return HttpResponse.json({
            objects: [{
              name: 'alpha_user',
              schema: {
                required: ['userName'],
                properties: { userName: { type: 'string' } }
              },
              other_fields: 'should not appear',
              _id: 'should not appear',
              description: 'should not appear'
            }]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
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
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return HttpResponse.json({
            objects: [{
              name: 'alpha_user',
              schema: {
                properties: { userName: { type: 'string' } }
              }
            }]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
      });

      const resultText = result.content[0].text;
      const parsedResult = JSON.parse(resultText);

      expect(parsedResult.required).toEqual([]);
    });

    it('should handle missing properties object', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return HttpResponse.json({
            objects: [{
              name: 'alpha_user',
              schema: {
                required: ['userName']
              }
            }]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
      });

      const resultText = result.content[0].text;
      const parsedResult = JSON.parse(resultText);

      expect(parsedResult.properties).toEqual({});
    });

    it('should return error when objectType not found in config', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return HttpResponse.json({
            objects: [
              { name: 'bravo_user', schema: { required: [], properties: {} } },
              { name: 'alpha_role', schema: { required: [], properties: {} } }
            ]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
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
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return HttpResponse.json({});
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
      });

      const resultText = result.content[0].text;

      expect(resultText).toContain('not found');
      expect(resultText).toContain('alpha_user');
      expect(resultText).toContain('Available types');
      expect(resultText).toContain('none');
    });

    it('should handle missing schema object', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return HttpResponse.json({
            objects: [{
              name: 'alpha_user'
            }]
          });
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
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
    it('should reject invalid objectType enum', () => {
      const schema = getManagedObjectSchemaTool.inputSchema.objectType;
      expect(() => schema.parse('invalid_type')).toThrow();
    });

    it('should accept all valid objectType enum values', async () => {
      const schema = getManagedObjectSchemaTool.inputSchema.objectType;
      expect(() => schema.parse('bravo_group')).not.toThrow();

      await getManagedObjectSchemaTool.toolFunction({
        objectType: 'bravo_group',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.stringContaining('/openidm/config/managed'),
        expect.any(Array)
      );
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Token expired' }),
            { status: 401 }
          );
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
      });

      const resultText = result.content[0].text;
      expect(resultText).toContain('Failed to retrieve managed object schema');
      expect(resultText).toMatch(/401|unauthorized/i);
    });

    it('should handle 500 Internal Server Error', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', ({ request }) => {
          return new HttpResponse(
            JSON.stringify({ error: 'internal_error', message: 'Server error' }),
            { status: 500 }
          );
        })
      );

      const result = await getManagedObjectSchemaTool.toolFunction({
        objectType: 'alpha_user',
      });

      const resultText = result.content[0].text;
      expect(resultText).toContain('Failed to retrieve managed object schema');
      expect(resultText).toMatch(/500|internal_error/i);
    });
  });
});
