import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getVariableTool } from '../../../src/tools/esv/getVariable.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('getVariable', () => {
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
    await snapshotTest('getVariable', getVariableTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with variableId', async () => {
      await getVariableTool.toolFunction({
        variableId: 'esv-api-key',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/variables/esv-api-key',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should add accept-api-version header', async () => {
      await getVariableTool.toolFunction({
        variableId: 'esv-api-key',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'resource=2.0',
          }),
        })
      );
    });

    it('should pass correct scopes to auth', async () => {
      await getVariableTool.toolFunction({
        variableId: 'esv-api-key',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idc:esv:read'],
        expect.any(Object)
      );
    });
  });

  // ===== RESPONSE PROCESSING TESTS (Application Logic) =====
  describe('Response Processing', () => {
    it('should decode base64 value field', async () => {
      server.use(
        http.get('https://*/environment/variables/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            _id: 'esv-test',
            valueBase64: 'aGVsbG8gd29ybGQ=', // "hello world" in base64
            expressionType: 'string',
          });
        })
      );

      const result = await getVariableTool.toolFunction({
        variableId: 'esv-test',
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);

      // Check that the value was decoded from base64
      expect(responseData.value).toBe('hello world');
    });

    it('should remove valueBase64 field from response', async () => {
      server.use(
        http.get('https://*/environment/variables/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            _id: 'esv-test',
            valueBase64: 'dGVzdA==', // "test" in base64
            expressionType: 'string',
          });
        })
      );

      const result = await getVariableTool.toolFunction({
        variableId: 'esv-test',
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);

      // Check that valueBase64 field was removed
      expect(responseData).not.toHaveProperty('valueBase64');
      // Check that value field was added
      expect(responseData).toHaveProperty('value');
      expect(responseData.value).toBe('test');
    });

    it('should handle variable without valueBase64 field', async () => {
      server.use(
        http.get('https://*/environment/variables/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            _id: 'esv-test',
            expressionType: 'string',
          });
        })
      );

      const result = await getVariableTool.toolFunction({
        variableId: 'esv-test',
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);

      expect(responseData._id).toBe('esv-test');
      expect(responseData.expressionType).toBe('string');
      expect(responseData).not.toHaveProperty('value');
      expect(responseData).not.toHaveProperty('valueBase64');
    });

    it('should preserve other fields in response', async () => {
      server.use(
        http.get('https://*/environment/variables/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            _id: 'esv-test',
            valueBase64: 'dGVzdA==', // "test" in base64
            expressionType: 'string',
            description: 'Test variable',
            lastChangeDate: '2025-01-11T10:00:00Z',
            lastChangedBy: 'user-123',
          });
        })
      );

      const result = await getVariableTool.toolFunction({
        variableId: 'esv-test',
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);

      // Check that all original fields are preserved
      expect(responseData._id).toBe('esv-test');
      expect(responseData.expressionType).toBe('string');
      expect(responseData.description).toBe('Test variable');
      expect(responseData.lastChangeDate).toBe('2025-01-11T10:00:00Z');
      expect(responseData.lastChangedBy).toBe('user-123');
      // Check that value was decoded and added
      expect(responseData.value).toBe('test');
      // Check that valueBase64 was removed
      expect(responseData).not.toHaveProperty('valueBase64');
    });

    it('should handle complex base64 values', async () => {
      // Test with JSON object encoded in base64
      const jsonObject = { key: 'value', nested: { prop: 'data' } };
      const base64Json = Buffer.from(JSON.stringify(jsonObject)).toString('base64');

      server.use(
        http.get('https://*/environment/variables/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            _id: 'esv-test',
            valueBase64: base64Json,
            expressionType: 'object',
          });
        })
      );

      const result = await getVariableTool.toolFunction({
        variableId: 'esv-test',
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);

      // Check that the complex value was decoded correctly
      expect(responseData.value).toBe(JSON.stringify(jsonObject));
    });

    it('should handle array values encoded in base64', async () => {
      // Test with array encoded in base64
      const arrayValue = ['item1', 'item2', 'item3'];
      const base64Array = Buffer.from(JSON.stringify(arrayValue)).toString('base64');

      server.use(
        http.get('https://*/environment/variables/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            _id: 'esv-test',
            valueBase64: base64Array,
            expressionType: 'array',
          });
        })
      );

      const result = await getVariableTool.toolFunction({
        variableId: 'esv-test',
      });

      const responseText = result.content[0].text;
      const responseData = JSON.parse(responseText);

      // Check that the array value was decoded correctly
      expect(responseData.value).toBe(JSON.stringify(arrayValue));
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require variableId parameter', () => {
      const schema = getVariableTool.inputSchema.variableId;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should accept any string for variableId', () => {
      const schema = getVariableTool.inputSchema.variableId;
      // API determines if valid, so our schema should accept any non-empty string
      expect(() => schema.parse('any-string')).not.toThrow();
      expect(() => schema.parse('esv-test')).not.toThrow();
      expect(() => schema.parse('something-else')).not.toThrow();
    });

    it('should accept empty variableId', () => {
      const schema = getVariableTool.inputSchema.variableId;
      // Note: The schema accepts empty string - API will return error if invalid
      expect(() => schema.parse('')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/environment/variables/*', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid credentials' }),
            { status: 401 }
          );
        })
      );

      const result = await getVariableTool.toolFunction({
        variableId: 'esv-api-key',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Failed to get variable');
      expect(responseText).toContain('esv-api-key');
    });

    it('should handle 404 Not Found error', async () => {
      server.use(
        http.get('https://*/environment/variables/*', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'not_found', message: 'Variable not found' }),
            { status: 404 }
          );
        })
      );

      const result = await getVariableTool.toolFunction({
        variableId: 'esv-nonexistent',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Failed to get variable');
      expect(responseText).toContain('esv-nonexistent');
    });
  });
});
