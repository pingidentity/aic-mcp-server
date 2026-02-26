import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNodeTypeDetailsTool } from '../../../src/tools/am/getNodeTypeDetails.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import * as amHelpers from '../../../src/utils/amHelpers.js';

describe('getNodeTypeDetails', () => {
  setupTestEnvironment();
  let fetchNodeTypeDetailsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchNodeTypeDetailsSpy = vi.spyOn(amHelpers, 'fetchNodeTypeDetails');
  });

  afterEach(() => {
    fetchNodeTypeDetailsSpy.mockRestore();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getNodeTypeDetails', getNodeTypeDetailsTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should call fetchNodeTypeDetails helper', async () => {
      fetchNodeTypeDetailsSpy.mockResolvedValue({
        UsernameCollectorNode: {
          nodeType: 'UsernameCollectorNode',
          schema: { type: 'object' },
          template: { _id: '' },
          outcomes: [{ id: 'outcome', displayName: 'Outcome' }],
          error: null
        }
      });

      await getNodeTypeDetailsTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['UsernameCollectorNode']
      });

      expect(fetchNodeTypeDetailsSpy).toHaveBeenCalledWith('alpha', ['UsernameCollectorNode'], ['fr:am:*']);
    });

    it('should fetch details for all requested node types', async () => {
      fetchNodeTypeDetailsSpy.mockResolvedValue({
        TypeA: { nodeType: 'TypeA', schema: {}, template: {}, outcomes: [], error: null },
        TypeB: { nodeType: 'TypeB', schema: {}, template: {}, outcomes: [], error: null }
      });

      const result = await getNodeTypeDetailsTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['TypeA', 'TypeB']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results['TypeA']).toBeDefined();
      expect(parsed.results['TypeB']).toBeDefined();
    });

    it('should handle partial failures gracefully', async () => {
      fetchNodeTypeDetailsSpy.mockResolvedValue({
        TypeA: { nodeType: 'TypeA', schema: {}, template: {}, outcomes: [], error: null },
        TypeB: { nodeType: 'TypeB', schema: null, template: null, outcomes: null, error: 'Fetch failed' }
      });

      const result = await getNodeTypeDetailsTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['TypeA', 'TypeB']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.successCount).toBe(1);
      expect(parsed.errorCount).toBe(1);
    });

    it('should count successes and errors', async () => {
      fetchNodeTypeDetailsSpy.mockResolvedValue({
        TypeA: { nodeType: 'TypeA', schema: {}, template: {}, outcomes: [], error: null },
        TypeB: { nodeType: 'TypeB', schema: null, template: null, outcomes: null, error: 'error' },
        TypeC: { nodeType: 'TypeC', schema: {}, template: {}, outcomes: [], error: null }
      });

      const result = await getNodeTypeDetailsTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['TypeA', 'TypeB', 'TypeC']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.successCount).toBe(2);
      expect(parsed.errorCount).toBe(1);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format response with results object', async () => {
      fetchNodeTypeDetailsSpy.mockResolvedValue({
        TypeA: { nodeType: 'TypeA', schema: {}, template: {}, outcomes: [], error: null }
      });

      const result = await getNodeTypeDetailsTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['TypeA']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.realm).toBe('alpha');
      expect(parsed.results).toBeDefined();
    });

    it('should include error details for failed fetches', async () => {
      fetchNodeTypeDetailsSpy.mockResolvedValue({
        TypeA: { nodeType: 'TypeA', schema: null, template: null, outcomes: null, error: 'Network error' }
      });

      const result = await getNodeTypeDetailsTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['TypeA']
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results['TypeA'].error).toBe('Network error');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => getNodeTypeDetailsTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should require non-empty nodeTypes array', () => {
      expect(() => getNodeTypeDetailsTool.inputSchema.nodeTypes.parse([])).toThrow();
      expect(() => getNodeTypeDetailsTool.inputSchema.nodeTypes.parse(['TypeA'])).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle errors from helper function', async () => {
      fetchNodeTypeDetailsSpy.mockRejectedValue(new Error('Network failure'));

      const result = await getNodeTypeDetailsTool.toolFunction({
        realm: 'alpha',
        nodeTypes: ['TypeA']
      });

      expect(result.content[0].text).toContain('Failed to get node type details');
    });
  });
});
