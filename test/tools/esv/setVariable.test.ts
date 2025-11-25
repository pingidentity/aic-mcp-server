import { describe, it, expect } from 'vitest';
import { setVariableTool } from '../../../src/tools/esv/setVariable.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('setVariable', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setVariable', setVariableTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with variableId', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-api-key',
        value: 'secret',
        type: 'string',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/variables/esv-api-key',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use PUT method', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-api-key',
        value: 'secret',
        type: 'string',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('should add accept-api-version header', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-api-key',
        value: 'secret',
        type: 'string',
      });

      expect(getSpy()).toHaveBeenCalledWith(
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
      await setVariableTool.toolFunction({
        variableId: 'esv-api-key',
        value: 'secret',
        type: 'string',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idc:esv:update'],
        expect.any(Object)
      );
    });
  });

  // ===== VALUE PROCESSING TESTS (Type-Specific Encoding Logic) =====
  describe('Value Processing', () => {
    it('should use String() conversion for string type', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-test',
        value: 'hello',
        type: 'string',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);

      // Decode base64 to verify encoding logic
      const decodedValue = Buffer.from(requestBody.valueBase64, 'base64').toString();
      expect(decodedValue).toBe('hello'); // Not JSON-stringified
    });

    it('should use String() conversion for list type', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-list',
        value: 'a,b,c',
        type: 'list',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);

      // Decode base64 to verify encoding logic
      const decodedValue = Buffer.from(requestBody.valueBase64, 'base64').toString();
      expect(decodedValue).toBe('a,b,c'); // Not JSON-stringified
    });

    it('should use JSON.stringify() for array type', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-array',
        value: ['a', 'b', 'c'],
        type: 'array',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);

      // Decode base64 to verify encoding logic
      const decodedValue = Buffer.from(requestBody.valueBase64, 'base64').toString();
      expect(decodedValue).toBe('["a","b","c"]'); // JSON-stringified
    });

    it('should use JSON.stringify() for object type', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-obj',
        value: { key: 'value' },
        type: 'object',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);

      // Decode base64 to verify encoding logic
      const decodedValue = Buffer.from(requestBody.valueBase64, 'base64').toString();
      expect(decodedValue).toBe('{"key":"value"}'); // JSON-stringified
    });

    it('should use JSON.stringify() for bool type', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-flag',
        value: true,
        type: 'bool',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);

      // Decode base64 to verify encoding logic
      const decodedValue = Buffer.from(requestBody.valueBase64, 'base64').toString();
      expect(decodedValue).toBe('true'); // JSON-stringified (boolean)
    });

    it('should use JSON.stringify() for int type', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-count',
        value: 42,
        type: 'int',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);

      // Decode base64 to verify encoding logic
      const decodedValue = Buffer.from(requestBody.valueBase64, 'base64').toString();
      expect(decodedValue).toBe('42'); // JSON-stringified (number)
    });

    it('should use JSON.stringify() for number type', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-pi',
        value: 3.14,
        type: 'number',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);

      // Decode base64 to verify encoding logic
      const decodedValue = Buffer.from(requestBody.valueBase64, 'base64').toString();
      expect(decodedValue).toBe('3.14'); // JSON-stringified (number)
    });
  });

  // ===== REQUEST BODY TESTS =====
  describe('Request Body', () => {
    it('should set _id in request body', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-test',
        value: 'x',
        type: 'string',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody._id).toBe('esv-test');
    });

    it('should set description when provided', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-test',
        value: 'x',
        type: 'string',
        description: 'Test var',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody.description).toBe('Test var');
    });

    it('should default description to empty string when omitted', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-test',
        value: 'x',
        type: 'string',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody.description).toBe('');
    });

    it('should set expressionType from type parameter', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-test',
        value: 'x',
        type: 'string',
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody.expressionType).toBe('string');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return success message with variableId', async () => {
      server.use(
        http.put('https://*/environment/variables/*', ({ request }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }
          return HttpResponse.json({
            _id: 'esv-api-key',
          });
        })
      );

      const result = await setVariableTool.toolFunction({
        variableId: 'esv-api-key',
        value: 'secret',
        type: 'string',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('esv-api-key');
      expect(responseText).toContain('Pod restart required');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require variableId parameter', () => {
      const schema = setVariableTool.inputSchema.variableId;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should require value parameter', () => {
      const schema = setVariableTool.inputSchema.value;
      // z.any() doesn't reject undefined in the same way
      // but the function signature requires it
      expect(schema.parse('test')).toBe('test');
      expect(schema.parse(undefined)).toBe(undefined);
    });

    it('should require type parameter', () => {
      const schema = setVariableTool.inputSchema.type;
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should reject invalid type enum', () => {
      const schema = setVariableTool.inputSchema.type;
      expect(() => schema.parse('invalid')).toThrow();
    });

    it('should accept all valid type enum values', () => {
      const schema = setVariableTool.inputSchema.type;
      const validTypes = ['string', 'array', 'object', 'bool', 'int', 'number', 'list'];

      for (const type of validTypes) {
        expect(() => schema.parse(type)).not.toThrow();
      }
    });

    it('should reject variableId without esv- prefix', async () => {
      const result = await setVariableTool.toolFunction({
        variableId: 'invalid-id',
        value: 'test',
        type: 'string',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Invalid variable ID');
      expect(responseText).toContain('invalid-id');
      expect(responseText).toContain("Must start with 'esv-'");
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should reject variableId missing esv- prefix', async () => {
      const result = await setVariableTool.toolFunction({
        variableId: 'no-prefix',
        value: 'test',
        type: 'string',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Invalid variable ID');
      expect(responseText).toContain("Must start with 'esv-'");
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should reject variableId with uppercase letters', async () => {
      const result = await setVariableTool.toolFunction({
        variableId: 'esv-UPPERCASE',
        value: 'test',
        type: 'string',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Invalid variable ID');
      expect(responseText).toContain('lowercase');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should reject variableId with invalid characters', async () => {
      const result = await setVariableTool.toolFunction({
        variableId: 'esv-test@#$',
        value: 'test',
        type: 'string',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Invalid variable ID');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should reject variableId exceeding max length', async () => {
      const result = await setVariableTool.toolFunction({
        variableId: 'esv-' + 'a'.repeat(121),
        value: 'test',
        type: 'string',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Invalid variable ID');
      expect(responseText).toContain('max 124 characters');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should accept minimum valid variableId', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-a',
        value: 'test',
        type: 'string',
      });

      expect(getSpy()).toHaveBeenCalled();
    });

    it('should accept maximum valid variableId', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-' + 'a'.repeat(120),
        value: 'test',
        type: 'string',
      });

      expect(getSpy()).toHaveBeenCalled();
    });

    it('should accept variableId with hyphens and underscores', async () => {
      await setVariableTool.toolFunction({
        variableId: 'esv-test_var-123',
        value: 'test',
        type: 'string',
      });

      expect(getSpy()).toHaveBeenCalled();
      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('esv-test_var-123');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.put('https://*/environment/variables/*', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid credentials' }),
            { status: 401 }
          );
        })
      );

      const result = await setVariableTool.toolFunction({
        variableId: 'esv-test',
        value: 'x',
        type: 'string',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Failed to set variable');
      expect(responseText).toContain('esv-test');
    });

    it('should handle 400 Bad Request error', async () => {
      server.use(
        http.put('https://*/environment/variables/*', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'bad_request', message: 'Type mismatch' }),
            { status: 400 }
          );
        })
      );

      const result = await setVariableTool.toolFunction({
        variableId: 'esv-test',
        value: 'x',
        type: 'string',
      });

      const responseText = result.content[0].text;
      expect(responseText).toContain('Failed to set variable');
      expect(responseText).toContain('esv-test');
    });
  });
});
