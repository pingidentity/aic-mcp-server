import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as apiHelpers from '../../src/utils/apiHelpers.js';
import {
  buildAMRealmUrl,
  buildAMJourneyNodesUrl,
  encodeBase64,
  decodeBase64Field,
  categorizeError,
  buildStaticNodes,
  generateNodeIdMapping,
  validateConnectionTargets,
  transformJourneyIds,
  fetchNodeSchemas,
  fetchNodeConfigs,
  fetchNodeTypeDetails,
  STATIC_NODE_IDS,
  UUID_REGEX,
  JourneyInput,
} from '../../src/utils/amHelpers.js';

describe('amHelpers', () => {
  // ===== buildAMRealmUrl =====
  describe('buildAMRealmUrl', () => {
    beforeEach(() => {
      process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    });

    it('should construct URL with realm and path', () => {
      const url = buildAMRealmUrl('alpha', 'scripts/abc-123');
      expect(url).toBe('https://test.forgeblocks.com/am/json/alpha/scripts/abc-123');
    });

    it('should not double-encode already encoded segments', () => {
      const url = buildAMRealmUrl('alpha', 'scripts/abc%20123');
      expect(url).toContain('scripts/abc%20123');
    });
  });

  // ===== buildAMJourneyNodesUrl =====
  describe('buildAMJourneyNodesUrl', () => {
    beforeEach(() => {
      process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    });

    it('should construct URL without nodeId', () => {
      const url = buildAMJourneyNodesUrl('alpha', 'UsernameCollectorNode');
      expect(url).toBe(
        'https://test.forgeblocks.com/am/json/alpha/realm-config/authentication/authenticationtrees/nodes/UsernameCollectorNode'
      );
    });

    it('should construct URL with nodeId', () => {
      const url = buildAMJourneyNodesUrl('alpha', 'UsernameCollectorNode', 'node-uuid');
      expect(url).toContain('UsernameCollectorNode/node-uuid');
    });

    it('should URL-encode nodeType', () => {
      const url = buildAMJourneyNodesUrl('alpha', 'Node With Spaces');
      expect(url).toContain('Node%20With%20Spaces');
    });
  });

  // ===== encodeBase64 =====
  describe('encodeBase64', () => {
    it('should encode UTF-8 string to base64', () => {
      const result = encodeBase64('console.log("hello");');
      expect(result).toBe(Buffer.from('console.log("hello");').toString('base64'));
    });

    it('should handle empty string', () => {
      const result = encodeBase64('');
      expect(result).toBe('');
    });
  });

  // ===== decodeBase64Field =====
  describe('decodeBase64Field', () => {
    it('should decode base64 field in place', () => {
      const obj = { script: Buffer.from('console.log("hello");').toString('base64') };
      decodeBase64Field(obj, 'script');
      expect(obj.script).toBe('console.log("hello");');
    });

    it('should ignore non-base64 strings', () => {
      const obj = { script: 'not-base64!!!' };
      decodeBase64Field(obj, 'script');
      expect(obj.script).toBe('not-base64!!!');
    });

    it('should ignore missing field', () => {
      const obj = { name: 'test' };
      decodeBase64Field(obj, 'script');
      expect(obj).toEqual({ name: 'test' });
    });

    it('should ignore non-string fields', () => {
      const obj = { script: 12345 };
      decodeBase64Field(obj, 'script');
      expect(obj.script).toBe(12345);
    });

    it('should handle null object', () => {
      expect(() => decodeBase64Field(null, 'script')).not.toThrow();
    });

    it('should handle undefined object', () => {
      expect(() => decodeBase64Field(undefined, 'script')).not.toThrow();
    });
  });

  // ===== categorizeError =====
  describe('categorizeError', () => {
    it('should categorize 401 as unauthorized', () => {
      expect(categorizeError('HTTP 401 Unauthorized')).toBe('unauthorized');
    });

    it('should categorize 403 as unauthorized', () => {
      expect(categorizeError('HTTP 403 Forbidden')).toBe('unauthorized');
    });

    it('should categorize 404 as not_found', () => {
      expect(categorizeError('HTTP 404 Not Found')).toBe('not_found');
    });

    it('should categorize 400 as invalid_request', () => {
      expect(categorizeError('HTTP 400 Bad Request')).toBe('invalid_request');
    });

    it('should categorize 422 as invalid_request', () => {
      expect(categorizeError('HTTP 422 Unprocessable Entity')).toBe('invalid_request');
    });

    it('should categorize other errors as transient', () => {
      expect(categorizeError('Connection timeout')).toBe('transient');
      expect(categorizeError('HTTP 500 Internal Server Error')).toBe('transient');
    });
  });

  // ===== buildStaticNodes =====
  describe('buildStaticNodes', () => {
    it('should return object with startNode and success/failure nodes', () => {
      const staticNodes = buildStaticNodes();
      expect(staticNodes).toHaveProperty('startNode');
      expect(staticNodes).toHaveProperty(STATIC_NODE_IDS.SUCCESS);
      expect(staticNodes).toHaveProperty(STATIC_NODE_IDS.FAILURE);
      expect(staticNodes.startNode).toEqual({ x: 50, y: 250 });
    });
  });

  // ===== generateNodeIdMapping =====
  describe('generateNodeIdMapping', () => {
    it('should generate UUIDs for human-readable IDs', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'login',
        nodes: {
          'login': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Login',
            connections: { outcome: 'success' },
            config: {},
          },
        },
      };
      const mapping = generateNodeIdMapping(journeyData);
      expect(mapping['login']).toBeDefined();
      expect(UUID_REGEX.test(mapping['login'])).toBe(true);
    });

    it('should preserve existing UUIDs', () => {
      const existingUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const journeyData: JourneyInput = {
        entryNodeId: existingUuid,
        nodes: {
          [existingUuid]: {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Login',
            connections: { outcome: 'success' },
            config: {},
          },
        },
      };
      const mapping = generateNodeIdMapping(journeyData);
      expect(mapping[existingUuid]).toBe(existingUuid);
    });

    it('should extract PageNode child node IDs', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'page',
        nodes: {
          'page': {
            nodeType: 'PageNode',
            displayName: 'Page',
            connections: { outcome: 'success' },
            config: {
              nodes: [
                { _id: 'child-1', nodeType: 'UsernameCollectorNode' },
              ],
            },
          },
        },
      };
      const mapping = generateNodeIdMapping(journeyData);
      expect(mapping['child-1']).toBeDefined();
      expect(UUID_REGEX.test(mapping['child-1'])).toBe(true);
    });

    it('should preserve PageNode children with existing UUID _id', () => {
      const childUuid = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
      const journeyData: JourneyInput = {
        entryNodeId: 'page',
        nodes: {
          'page': {
            nodeType: 'PageNode',
            displayName: 'Page',
            connections: { outcome: 'success' },
            config: {
              nodes: [
                { _id: childUuid, nodeType: 'UsernameCollectorNode' },
              ],
            },
          },
        },
      };
      const mapping = generateNodeIdMapping(journeyData);
      expect(mapping[childUuid]).toBe(childUuid);
    });

    it('should skip PageNode children without _id', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'page',
        nodes: {
          'page': {
            nodeType: 'PageNode',
            displayName: 'Page',
            connections: { outcome: 'success' },
            config: {
              nodes: [
                { nodeType: 'UsernameCollectorNode' },
              ],
            },
          },
        },
      };
      const mapping = generateNodeIdMapping(journeyData);
      // Only the top-level 'page' node should be in the mapping
      expect(Object.keys(mapping)).toEqual(['page']);
    });

    it('should handle empty nodes object', () => {
      const journeyData: JourneyInput = {
        entryNodeId: '',
        nodes: {},
      };
      const mapping = generateNodeIdMapping(journeyData);
      expect(mapping).toEqual({});
    });
  });

  // ===== validateConnectionTargets =====
  describe('validateConnectionTargets', () => {
    it('should return valid for correct journey', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'login',
        nodes: {
          'login': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Login',
            connections: { outcome: 'success' },
            config: {},
          },
        },
      };
      const result = validateConnectionTargets(journeyData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid entryNodeId', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'nonexistent',
        nodes: {
          'login': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Login',
            connections: { outcome: 'success' },
            config: {},
          },
        },
      };
      const result = validateConnectionTargets(journeyData);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('entryNodeId');
    });

    it('should detect unknown connection target', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'login',
        nodes: {
          'login': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Login',
            connections: { outcome: 'nonexistent-node' },
            config: {},
          },
        },
      };
      const result = validateConnectionTargets(journeyData);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('unknown target');
    });

    it('should accept "success" and "failure" aliases (case-insensitive)', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'login',
        nodes: {
          'login': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Login',
            connections: { true: 'Success', false: 'Failure' },
            config: {},
          },
        },
      };
      const result = validateConnectionTargets(journeyData);
      expect(result.isValid).toBe(true);
    });

    it('should detect self-referencing connection', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'login',
        nodes: {
          'login': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Login',
            connections: { outcome: 'login' },
            config: {},
          },
        },
      };
      const result = validateConnectionTargets(journeyData);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('cannot connect to itself');
    });

    it('should return multiple errors', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'nonexistent',
        nodes: {
          'login': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Login',
            connections: { outcome: 'unknown1', other: 'unknown2' },
            config: {},
          },
        },
      };
      const result = validateConnectionTargets(journeyData);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('should validate against node keys, not values', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'a',
        nodes: {
          'a': {
            nodeType: 'Node',
            displayName: 'A',
            connections: { outcome: 'b' },
            config: {},
          },
          'b': {
            nodeType: 'Node',
            displayName: 'B',
            connections: { outcome: 'success' },
            config: {},
          },
        },
      };
      const result = validateConnectionTargets(journeyData);
      expect(result.isValid).toBe(true);
    });

    it('should handle empty nodes object', () => {
      const journeyData: JourneyInput = {
        entryNodeId: 'nonexistent',
        nodes: {},
      };
      const result = validateConnectionTargets(journeyData);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('entryNodeId');
    });
  });

  // ===== transformJourneyIds =====
  describe('transformJourneyIds', () => {
    const baseJourney: JourneyInput = {
      entryNodeId: 'login',
      nodes: {
        'login': {
          nodeType: 'UsernameCollectorNode',
          displayName: 'Login',
          connections: { outcome: 'password' },
          config: { prop: 'value' },
        },
        'password': {
          nodeType: 'PasswordCollectorNode',
          displayName: 'Password',
          connections: { outcome: 'success' },
          config: {},
        },
      },
    };

    it('should transform node keys to UUIDs', () => {
      const mapping = { 'login': 'uuid-1', 'password': 'uuid-2' };
      const result = transformJourneyIds('TestJourney', baseJourney, mapping);
      expect(result.nodes['uuid-1']).toBeDefined();
      expect(result.nodes['uuid-2']).toBeDefined();
      expect(result.nodes['login']).toBeUndefined();
    });

    it('should transform entryNodeId to UUID', () => {
      const mapping = { 'login': 'uuid-1', 'password': 'uuid-2' };
      const result = transformJourneyIds('TestJourney', baseJourney, mapping);
      expect(result.entryNodeId).toBe('uuid-1');
    });

    it('should transform connection targets to UUIDs', () => {
      const mapping = { 'login': 'uuid-1', 'password': 'uuid-2' };
      const result = transformJourneyIds('TestJourney', baseJourney, mapping);
      expect(result.nodes['uuid-1'].connections.outcome).toBe('uuid-2');
    });

    it('should resolve "success"/"failure" aliases to static node IDs', () => {
      const mapping = { 'login': 'uuid-1', 'password': 'uuid-2' };
      const result = transformJourneyIds('TestJourney', baseJourney, mapping);
      expect(result.nodes['uuid-2'].connections.outcome).toBe(STATIC_NODE_IDS.SUCCESS);
    });

    it('should resolve aliases case-insensitively', () => {
      const journey: JourneyInput = {
        entryNodeId: 'node',
        nodes: {
          'node': {
            nodeType: 'Node',
            displayName: 'Node',
            connections: { true: 'SUCCESS', false: 'FAILURE' },
            config: {},
          },
        },
      };
      const mapping = { 'node': 'uuid-1' };
      const result = transformJourneyIds('Test', journey, mapping);
      expect(result.nodes['uuid-1'].connections.true).toBe(STATIC_NODE_IDS.SUCCESS);
      expect(result.nodes['uuid-1'].connections.false).toBe(STATIC_NODE_IDS.FAILURE);
    });

    it('should inject _id into node config', () => {
      const mapping = { 'login': 'uuid-1', 'password': 'uuid-2' };
      const result = transformJourneyIds('TestJourney', baseJourney, mapping);
      expect(result.nodes['uuid-1'].config._id).toBe('uuid-1');
    });

    it('should transform PageNode child node IDs', () => {
      const journey: JourneyInput = {
        entryNodeId: 'page',
        nodes: {
          'page': {
            nodeType: 'PageNode',
            displayName: 'Page',
            connections: { outcome: 'success' },
            config: {
              nodes: [
                { _id: 'child-1', nodeType: 'UsernameCollectorNode', _properties: {} },
              ],
            },
          },
        },
      };
      const mapping = { 'page': 'uuid-page' };
      const result = transformJourneyIds('Test', journey, mapping);
      // Child nodes should have _id preserved or assigned
      expect(result.nodes['uuid-page'].config.nodes[0]._id).toBeDefined();
    });

    it('should include staticNodes in output', () => {
      const mapping = { 'login': 'uuid-1', 'password': 'uuid-2' };
      const result = transformJourneyIds('TestJourney', baseJourney, mapping);
      expect(result.staticNodes).toBeDefined();
      expect(result.staticNodes).toHaveProperty('startNode');
      expect(result.staticNodes).toHaveProperty(STATIC_NODE_IDS.SUCCESS);
    });
  });

  // ===== fetchNodeSchemas =====
  describe('fetchNodeSchemas', () => {
    let spy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      process.env.AIC_BASE_URL = 'test.forgeblocks.com';
      spy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it('should fetch schemas in parallel', async () => {
      spy.mockResolvedValue({
        data: { type: 'object', properties: {} },
        response: new Response(),
      });

      const results = await fetchNodeSchemas('alpha', ['TypeA', 'TypeB'], ['fr:am:*']);
      expect(results).toHaveLength(2);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(results[0].nodeType).toBe('TypeA');
      expect(results[1].nodeType).toBe('TypeB');
    });

    it('should handle individual failures', async () => {
      spy
        .mockResolvedValueOnce({
          data: { type: 'object' },
          response: new Response(),
        })
        .mockRejectedValueOnce(new Error('404 Not Found'));

      const results = await fetchNodeSchemas('alpha', ['TypeA', 'TypeB'], ['fr:am:*']);
      expect(results[0].error).toBeNull();
      expect(results[0].schema).toEqual({ type: 'object' });
      expect(results[1].error).toContain('404');
      expect(results[1].schema).toBeNull();
    });
  });

  // ===== fetchNodeConfigs =====
  describe('fetchNodeConfigs', () => {
    let spy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      process.env.AIC_BASE_URL = 'test.forgeblocks.com';
      spy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it('should fetch configs in parallel', async () => {
      spy.mockResolvedValue({
        data: { _id: 'node-1', prop: 'val' },
        response: new Response(),
      });

      const results = await fetchNodeConfigs(
        'alpha',
        [
          { nodeId: 'node-1', nodeType: 'TypeA' },
          { nodeId: 'node-2', nodeType: 'TypeB' },
        ],
        ['fr:am:*']
      );
      expect(results).toHaveLength(2);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should handle missing nodeType', async () => {
      const results = await fetchNodeConfigs(
        'alpha',
        [{ nodeId: 'node-1', nodeType: '' }],
        ['fr:am:*']
      );
      expect(results[0].error).toBe('Missing nodeType');
      expect(results[0].config).toBeNull();
    });
  });

  // ===== fetchNodeTypeDetails =====
  describe('fetchNodeTypeDetails', () => {
    let spy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      process.env.AIC_BASE_URL = 'test.forgeblocks.com';
      spy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it('should fetch schema, template, and outcomes in parallel for each type', async () => {
      spy.mockResolvedValue({
        data: { type: 'object' },
        response: new Response(),
      });

      const results = await fetchNodeTypeDetails('alpha', ['TypeA'], ['fr:am:*']);
      // 3 calls per node type: schema, template, outcomes
      expect(spy).toHaveBeenCalledTimes(3);
      expect(results['TypeA']).toBeDefined();
      expect(results['TypeA'].error).toBeNull();
    });

    it('should handle individual failures', async () => {
      spy.mockRejectedValue(new Error('Network error'));

      const results = await fetchNodeTypeDetails('alpha', ['TypeA'], ['fr:am:*']);
      expect(results['TypeA'].error).toContain('Network error');
      expect(results['TypeA'].schema).toBeNull();
    });

    it('should return results keyed by nodeType', async () => {
      spy.mockResolvedValue({
        data: { type: 'object' },
        response: new Response(),
      });

      const results = await fetchNodeTypeDetails('alpha', ['TypeA', 'TypeB'], ['fr:am:*']);
      expect(Object.keys(results)).toEqual(expect.arrayContaining(['TypeA', 'TypeB']));
    });
  });
});
