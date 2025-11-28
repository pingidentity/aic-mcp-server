import { describe, it, expect } from 'vitest';
import { deleteVariableTool } from '../../../src/tools/esv/deleteVariable.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('deleteVariable', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteVariable', deleteVariableTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL, method, headers, and scopes', async () => {
      await deleteVariableTool.toolFunction({
        variableId: 'esv-old-key',
      });

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/variables/esv-old-key',
        ['fr:idc:esv:update'],
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'accept-api-version': 'protocol=1.0,resource=1.0',
          }),
        })
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format successful response with pod restart message', async () => {
      server.use(
        http.delete('https://*/environment/variables/:variableId', ({ request, params }) => {
          const authHeader = request.headers.get('Authorization');
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new HttpResponse(
              JSON.stringify({ error: 'unauthorized' }),
              { status: 401 }
            );
          }

          return HttpResponse.json({
            _id: params.variableId as string,
          });
        })
      );

      const result = await deleteVariableTool.toolFunction({
        variableId: 'esv-old-key',
      });

      expect(result.content[0].text).toContain('Deleted variable');
      expect(result.content[0].text).toContain('esv-old-key');
      expect(result.content[0].text).toContain('Pod restart required');
      expect(result.content[0].type).toBe('text');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require variableId parameter', () => {
      const schema = deleteVariableTool.inputSchema.variableId;

      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should accept any string for variableId', async () => {
      // Unlike setVariable, deleteVariable doesn't enforce format validation
      const schema = deleteVariableTool.inputSchema.variableId;

      // Any non-empty string should be accepted
      expect(() => schema.parse('any-string')).not.toThrow();
      expect(() => schema.parse('not-an-esv-format')).not.toThrow();
      expect(() => schema.parse('123')).not.toThrow();
    });

    it('should reject empty variableId', () => {
      const schema = deleteVariableTool.inputSchema.variableId;

      expect(() => schema.parse('')).toThrow(/String must contain at least 1 character/);
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, body: { error: 'unauthorized', message: 'Invalid token' }, variableId: 'esv-test' },
      { status: 404, body: { code: 404, message: 'Variable not found' }, variableId: 'esv-nonexistent' },
      { status: 403, body: { code: 403, message: 'Insufficient permissions' }, variableId: 'esv-protected' },
    ])('handles $status errors', async ({ status, body, variableId }) => {
      server.use(
        http.delete('https://*/environment/variables/:variableId', () => {
          return new HttpResponse(JSON.stringify(body), { status });
        })
      );

      const result = await deleteVariableTool.toolFunction({ variableId });

      expect(result.content[0].text).toContain('Failed to delete variable');
      expect(result.content[0].text).toContain(variableId);
      expect(result.content[0].type).toBe('text');
    });
  });
});
