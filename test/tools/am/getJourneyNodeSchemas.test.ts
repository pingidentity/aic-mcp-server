import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getJourneyNodeSchemasTool } from '../../../src/tools/am/getJourneyNodeSchemas.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as amHelpers from '../../../src/utils/amHelpers.js';

describe('getJourneyNodeSchemas', () => {
  const getSpy = setupTestEnvironment();
  let fetchNodeSchemasSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchNodeSchemasSpy = vi.spyOn(amHelpers, 'fetchNodeSchemas');
  });

  afterEach(() => {
    fetchNodeSchemasSpy.mockRestore();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getJourneyNodeSchemas', getJourneyNodeSchemasTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should make POST requests with _action=schema for each node type', async () => {
      // Mock fetchNodeSchemas to verify it's called correctly with multiple types
      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'UsernameCollectorNode', schema: { type: 'object' }, error: null },
        { nodeType: 'PasswordCollectorNode', schema: { type: 'object' }, error: null },
      ]);

      await getJourneyNodeSchemasTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['UsernameCollectorNode', 'PasswordCollectorNode'],
      });

      expect(fetchNodeSchemasSpy).toHaveBeenCalledWith(
        'alpha',
        ['UsernameCollectorNode', 'PasswordCollectorNode'],
        ['fr:am:*']
      );
    });

    it('should include correct headers and scopes', async () => {
      server.use(
        http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*', () => {
          return HttpResponse.json({ type: 'object' });
        })
      );

      await getJourneyNodeSchemasTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['TestNode'],
      });

      const [, scopes, options] = getSpy().mock.calls[0];
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.method).toBe('POST');
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should URL-encode node type names', async () => {
      server.use(
        http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*', () => {
          return HttpResponse.json({ type: 'object' });
        })
      );

      await getJourneyNodeSchemasTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['Node With Spaces'],
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('Node%20With%20Spaces');
    });
  });

  // ===== RESPONSE PROCESSING TESTS =====
  describe('Response Processing', () => {
    it('should return results with success and error counts', async () => {
      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'NodeA', schema: { type: 'object', properties: { foo: {} } }, error: null },
        { nodeType: 'NodeB', schema: { type: 'object', properties: { bar: {} } }, error: null },
      ]);

      const result = await getJourneyNodeSchemasTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['NodeA', 'NodeB'],
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.realm).toBe('alpha');
      expect(responseData.totalRequested).toBe(2);
      expect(responseData.successCount).toBe(2);
      expect(responseData.errorCount).toBe(0);
      expect(responseData.results).toHaveLength(2);
    });

    it('should capture errors per failed node type', async () => {
      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'GoodNode', schema: { type: 'object' }, error: null },
        { nodeType: 'BadNode', schema: null, error: 'Not found' },
      ]);

      const result = await getJourneyNodeSchemasTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['GoodNode', 'BadNode'],
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.successCount).toBe(1);
      expect(responseData.errorCount).toBe(1);

      const goodResult = responseData.results.find((r: any) => r.nodeType === 'GoodNode');
      const badResult = responseData.results.find((r: any) => r.nodeType === 'BadNode');
      expect(goodResult.error).toBeNull();
      expect(badResult.error).not.toBeNull();
    });

    it('should handle all types failing', async () => {
      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'BadNode1', schema: null, error: 'Not found' },
        { nodeType: 'BadNode2', schema: null, error: 'Not found' },
      ]);

      const result = await getJourneyNodeSchemasTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['BadNode1', 'BadNode2'],
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.successCount).toBe(0);
      expect(responseData.errorCount).toBe(2);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => getJourneyNodeSchemasTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should reject invalid realm', () => {
      expect(() => getJourneyNodeSchemasTool.inputSchema.realm.parse('invalid')).toThrow();
    });

    it('should require nodeTypes array with at least 1 element', () => {
      expect(() => getJourneyNodeSchemasTool.inputSchema.nodeTypes.parse([])).toThrow();
      expect(() => getJourneyNodeSchemasTool.inputSchema.nodeTypes.parse(undefined)).toThrow();
    });

    it('should use safePathSegmentSchema for nodeTypes elements', () => {
      const schema = getJourneyNodeSchemasTool.inputSchema.nodeTypes;
      expect(() => schema.parse(['../etc/passwd'])).toThrow(/path traversal/);
      expect(() => schema.parse([''])).toThrow(/cannot be empty/);
      expect(() => schema.parse(['ValidNode'])).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle complete failure gracefully', async () => {
      // Mock a network error for the fetch
      server.use(
        http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*', () => {
          return HttpResponse.error();
        })
      );

      const result = await getJourneyNodeSchemasTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['TestNode'],
      });

      // Should still return a result with error info
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.errorCount).toBe(1);
    });
  });
});
