import { describe, it, expect } from 'vitest';
import { deleteJourneyNodesTool } from '../../../src/tools/am/deleteJourneyNodes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';

describe('deleteJourneyNodes', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteJourneyNodes', deleteJourneyNodesTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should execute deletes for all nodes', async () => {
      getSpy().mockResolvedValue({
        data: null,
        response: new Response(null, { status: 204 }),
      });

      const result = await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'node-1' },
          { nodeType: 'TypeB', nodeId: 'node-2' },
        ],
      });

      expect(getSpy()).toHaveBeenCalledTimes(2);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results).toHaveLength(2);
    });

    it('should continue deleting even when some fail', async () => {
      getSpy()
        .mockRejectedValueOnce(new Error('400 Bad Request'))
        .mockResolvedValueOnce({
          data: null,
          response: new Response(null, { status: 204 }),
        });

      const result = await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'fail-me' },
          { nodeType: 'TypeB', nodeId: 'succeed' },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results).toHaveLength(2);
    });

    it('should count successes and errors', async () => {
      getSpy()
        .mockRejectedValueOnce(new Error('400 Bad Request'))
        .mockResolvedValueOnce({
          data: null,
          response: new Response(null, { status: 204 }),
        })
        .mockResolvedValueOnce({
          data: null,
          response: new Response(null, { status: 204 }),
        });

      const result = await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'fail-me' },
          { nodeType: 'TypeB', nodeId: 'succeed-1' },
          { nodeType: 'TypeC', nodeId: 'succeed-2' },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.successCount).toBe(2);
      expect(parsed.errorCount).toBe(1);
    });

    it('should include error details for failed deletions', async () => {
      getSpy().mockRejectedValue(new Error('404 Not Found'));

      const result = await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'node-1' },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results[0].deleted).toBe(false);
      expect(parsed.results[0].error).toContain('404');
    });

    it('should return results for all nodes', async () => {
      getSpy().mockResolvedValue({
        data: null,
        response: new Response(null, { status: 204 }),
      });

      const result = await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'node-1' },
          { nodeType: 'TypeB', nodeId: 'node-2' },
          { nodeType: 'TypeC', nodeId: 'node-3' },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results).toHaveLength(3);
      expect(parsed.results.map((r: any) => r.nodeId)).toEqual(['node-1', 'node-2', 'node-3']);
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build correct URLs for each node', async () => {
      getSpy().mockResolvedValue({
        data: null,
        response: new Response(null, { status: 204 }),
      });

      await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'UsernameCollectorNode', nodeId: 'node-1' },
        ],
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('UsernameCollectorNode');
      expect(url).toContain('node-1');
    });

    it('should use DELETE method for each node', async () => {
      getSpy().mockResolvedValue({
        data: null,
        response: new Response(null, { status: 204 }),
      });

      await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'node-1' },
        ],
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('DELETE');
    });

    it('should include AM_API_HEADERS', async () => {
      getSpy().mockResolvedValue({
        data: null,
        response: new Response(null, { status: 204 }),
      });

      await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'node-1' },
        ],
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format response with results array', async () => {
      getSpy().mockResolvedValue({
        data: null,
        response: new Response(null, { status: 204 }),
      });

      const result = await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'node-1' },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.realm).toBe('alpha');
      expect(parsed.results).toBeDefined();
      expect(parsed.successCount).toBeDefined();
      expect(parsed.errorCount).toBeDefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => deleteJourneyNodesTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should require non-empty nodes array', () => {
      expect(() => deleteJourneyNodesTool.inputSchema.nodes.parse([])).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle mixed success/failure results', async () => {
      getSpy()
        .mockResolvedValueOnce({
          data: null,
          response: new Response(null, { status: 204 }),
        })
        .mockRejectedValueOnce(new Error('500 Internal Server Error'));

      const result = await deleteJourneyNodesTool.toolFunction({
        realm: 'alpha',
        nodes: [
          { nodeType: 'TypeA', nodeId: 'node-ok' },
          { nodeType: 'TypeB', nodeId: 'node-fail' },
        ],
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.successCount).toBe(1);
      expect(parsed.errorCount).toBe(1);
    });
  });
});
