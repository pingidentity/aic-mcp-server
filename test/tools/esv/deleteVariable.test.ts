import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { deleteVariableTool } from '../../../src/tools/esv/deleteVariable.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('deleteVariable', () => {
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
    await snapshotTest('deleteVariable', deleteVariableTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should construct URL with variableId', async () => {
      await deleteVariableTool.toolFunction({
        variableId: 'esv-old-key',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/environment/variables/esv-old-key',
        ['fr:idc:esv:update'],
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should use DELETE method', async () => {
      await deleteVariableTool.toolFunction({
        variableId: 'esv-old-key',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should add accept-api-version header with protocol and resource 1.0', async () => {
      await deleteVariableTool.toolFunction({
        variableId: 'esv-old-key',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-api-version': 'protocol=1.0,resource=1.0',
          }),
        })
      );
    });

    it('should pass correct scopes to auth', async () => {
      await deleteVariableTool.toolFunction({
        variableId: 'esv-old-key',
      });

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
        ['fr:idc:esv:update'],
        expect.any(Object)
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
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.delete('https://*/environment/variables/:variableId', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized', message: 'Invalid token' }),
            { status: 401 }
          );
        })
      );

      const result = await deleteVariableTool.toolFunction({
        variableId: 'esv-test',
      });

      expect(result.content[0].text).toContain('Failed to delete variable');
      expect(result.content[0].text).toContain('esv-test');
      expect(result.content[0].type).toBe('text');
    });

    it('should handle 404 Not Found error', async () => {
      server.use(
        http.delete('https://*/environment/variables/:variableId', () => {
          return new HttpResponse(
            JSON.stringify({ code: 404, message: 'Variable not found' }),
            { status: 404 }
          );
        })
      );

      const result = await deleteVariableTool.toolFunction({
        variableId: 'esv-nonexistent',
      });

      // Verify error includes variable ID for context
      expect(result.content[0].text).toContain('Failed to delete variable');
      expect(result.content[0].text).toContain('esv-nonexistent');
      expect(result.content[0].type).toBe('text');
    });

    it('should handle 403 Forbidden error', async () => {
      server.use(
        http.delete('https://*/environment/variables/:variableId', () => {
          return new HttpResponse(
            JSON.stringify({ code: 403, message: 'Insufficient permissions' }),
            { status: 403 }
          );
        })
      );

      const result = await deleteVariableTool.toolFunction({
        variableId: 'esv-protected',
      });

      expect(result.content[0].text).toContain('Failed to delete variable');
      expect(result.content[0].text).toContain('esv-protected');
      expect(result.content[0].type).toBe('text');
    });
  });
});
