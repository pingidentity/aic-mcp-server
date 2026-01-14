import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getJourneyTool } from '../../../src/tools/am/getJourney.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as amHelpers from '../../../src/utils/amHelpers.js';

describe('getJourney', () => {
  const getSpy = setupTestEnvironment();
  let fetchNodeSchemasSpy: ReturnType<typeof vi.spyOn>;
  let fetchNodeConfigsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchNodeSchemasSpy = vi.spyOn(amHelpers, 'fetchNodeSchemas');
    fetchNodeConfigsSpy = vi.spyOn(amHelpers, 'fetchNodeConfigs');
  });

  afterEach(() => {
    fetchNodeSchemasSpy.mockRestore();
    fetchNodeConfigsSpy.mockRestore();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getJourney', getJourneyTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should return journey as-is when no nodes present', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'EmptyJourney',
            nodes: {},
          });
        })
      );

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'EmptyJourney',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData._id).toBe('EmptyJourney');
      expect(fetchNodeSchemasSpy).not.toHaveBeenCalled();
      expect(fetchNodeConfigsSpy).not.toHaveBeenCalled();
    });

    it('should fetch schemas and configs for nodes', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'LoginJourney',
            nodes: {
              'node-1': { nodeType: 'UsernameCollectorNode' },
              'node-2': { nodeType: 'PasswordCollectorNode' },
            },
          });
        })
      );

      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'UsernameCollectorNode', schema: { type: 'object' }, error: null },
        { nodeType: 'PasswordCollectorNode', schema: { type: 'object' }, error: null },
      ]);

      fetchNodeConfigsSpy.mockResolvedValue([
        { nodeId: 'node-1', nodeType: 'UsernameCollectorNode', config: { _id: 'node-1' }, error: null },
        { nodeId: 'node-2', nodeType: 'PasswordCollectorNode', config: { _id: 'node-2' }, error: null },
      ]);

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'LoginJourney',
      });

      expect(fetchNodeSchemasSpy).toHaveBeenCalledWith(
        'alpha',
        expect.arrayContaining(['UsernameCollectorNode', 'PasswordCollectorNode']),
        ['fr:am:*']
      );
      expect(fetchNodeConfigsSpy).toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.nodeData).toBeDefined();
      expect(responseData.nodeData.schemas['UsernameCollectorNode']).toEqual({ type: 'object' });
      expect(responseData.nodeData.configs['node-1']).toEqual({ _id: 'node-1' });
    });

    it('should deduplicate schema fetches for repeated node types', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'Journey',
            nodes: {
              'node-1': { nodeType: 'UsernameCollectorNode' },
              'node-2': { nodeType: 'UsernameCollectorNode' },
              'node-3': { nodeType: 'PasswordCollectorNode' },
            },
          });
        })
      );

      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'UsernameCollectorNode', schema: { type: 'object' }, error: null },
        { nodeType: 'PasswordCollectorNode', schema: { type: 'object' }, error: null },
      ]);

      fetchNodeConfigsSpy.mockResolvedValue([
        { nodeId: 'node-1', nodeType: 'UsernameCollectorNode', config: {}, error: null },
        { nodeId: 'node-2', nodeType: 'UsernameCollectorNode', config: {}, error: null },
        { nodeId: 'node-3', nodeType: 'PasswordCollectorNode', config: {}, error: null },
      ]);

      await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Journey',
      });

      // Should only request 2 unique node types, not 3
      const schemaCall = fetchNodeSchemasSpy.mock.calls[0];
      expect(schemaCall[1]).toHaveLength(2);
    });

    it('should handle nested nodes in PageNode configs', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'PageJourney',
            nodes: {
              'page-node-1': { nodeType: 'PageNode' },
            },
          });
        })
      );

      // First call for top-level nodes
      fetchNodeSchemasSpy
        .mockResolvedValueOnce([
          { nodeType: 'PageNode', schema: { type: 'object' }, error: null },
        ])
        .mockResolvedValueOnce([
          { nodeType: 'NestedNode', schema: { type: 'object' }, error: null },
        ]);

      // First call returns PageNode config with nested nodes
      fetchNodeConfigsSpy
        .mockResolvedValueOnce([
          {
            nodeId: 'page-node-1',
            nodeType: 'PageNode',
            config: {
              _id: 'page-node-1',
              nodes: [
                { _id: 'nested-1', nodeType: 'NestedNode' },
              ],
            },
            error: null,
          },
        ])
        .mockResolvedValueOnce([
          { nodeId: 'nested-1', nodeType: 'NestedNode', config: { _id: 'nested-1' }, error: null },
        ]);

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'PageJourney',
      });

      // Should have called fetchNodeConfigs twice - once for PageNode, once for nested
      expect(fetchNodeConfigsSpy).toHaveBeenCalledTimes(2);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.nodeData.configs['page-node-1']).toBeDefined();
      expect(responseData.nodeData.configs['nested-1']).toBeDefined();
    });

    it('should fail fast on schema fetch error', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'Journey',
            nodes: {
              'node-1': { nodeType: 'TestNode' },
            },
          });
        })
      );

      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'TestNode', schema: null, error: 'Schema fetch failed: 404' },
      ]);

      fetchNodeConfigsSpy.mockResolvedValue([
        { nodeId: 'node-1', nodeType: 'TestNode', config: { _id: 'node-1' }, error: null },
      ]);

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Journey',
      });

      expect(result.content[0].text).toContain('Failed to get journey');
      expect(result.content[0].text).toContain('schema for node type "TestNode"');
    });

    it('should fail fast on config fetch error', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'Journey',
            nodes: {
              'node-1': { nodeType: 'TestNode' },
            },
          });
        })
      );

      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'TestNode', schema: { type: 'object' }, error: null },
      ]);

      fetchNodeConfigsSpy.mockResolvedValue([
        { nodeId: 'node-1', nodeType: 'TestNode', config: null, error: 'Config fetch failed: 404' },
      ]);

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Journey',
      });

      expect(result.content[0].text).toContain('Failed to get journey');
      expect(result.content[0].text).toContain('config for node "node-1"');
    });

    it('should fail fast on nested node schema error', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'PageJourney',
            nodes: {
              'page-node-1': { nodeType: 'PageNode' },
            },
          });
        })
      );

      fetchNodeSchemasSpy
        .mockResolvedValueOnce([
          { nodeType: 'PageNode', schema: { type: 'object' }, error: null },
        ])
        .mockResolvedValueOnce([
          { nodeType: 'NestedNode', schema: null, error: 'Nested schema failed: 404' },
        ]);

      fetchNodeConfigsSpy
        .mockResolvedValueOnce([
          {
            nodeId: 'page-node-1',
            nodeType: 'PageNode',
            config: {
              _id: 'page-node-1',
              nodes: [{ _id: 'nested-1', nodeType: 'NestedNode' }],
            },
            error: null,
          },
        ]);

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'PageJourney',
      });

      expect(result.content[0].text).toContain('Failed to get journey');
      expect(result.content[0].text).toContain('schema for node type "NestedNode"');
    });

    it('should fail fast on nested node config error', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'PageJourney',
            nodes: {
              'page-node-1': { nodeType: 'PageNode' },
            },
          });
        })
      );

      fetchNodeSchemasSpy
        .mockResolvedValueOnce([
          { nodeType: 'PageNode', schema: { type: 'object' }, error: null },
        ])
        .mockResolvedValueOnce([]);

      fetchNodeConfigsSpy
        .mockResolvedValueOnce([
          {
            nodeId: 'page-node-1',
            nodeType: 'PageNode',
            config: {
              _id: 'page-node-1',
              nodes: [{ _id: 'nested-1', nodeType: 'NestedNode' }],
            },
            error: null,
          },
        ])
        .mockResolvedValueOnce([
          { nodeId: 'nested-1', nodeType: 'NestedNode', config: null, error: 'Nested config failed: 404' },
        ]);

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'PageJourney',
      });

      expect(result.content[0].text).toContain('Failed to get journey');
      expect(result.content[0].text).toContain('config for node "nested-1"');
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build correct journey URL', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({ _id: 'Test', nodes: {} });
        })
      );

      await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'LoginJourney',
      });

      const [url, scopes, options] = getSpy().mock.calls[0];
      expect(url).toContain('/am/json/alpha/realm-config/authentication/authenticationtrees/trees/LoginJourney');
      expect(scopes).toEqual(['fr:am:*']);
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should URL-encode journey name', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({ _id: 'Test', nodes: {} });
        })
      );

      await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Journey With Spaces',
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('Journey%20With%20Spaces');
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should include error category in failure message', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json({
            _id: 'Journey',
            nodes: { 'node-1': { nodeType: 'TestNode' } },
          });
        })
      );

      fetchNodeSchemasSpy.mockResolvedValue([
        { nodeType: 'TestNode', schema: null, error: 'HTTP 404: Not Found' },
      ]);

      fetchNodeConfigsSpy.mockResolvedValue([
        { nodeId: 'node-1', nodeType: 'TestNode', config: {}, error: null },
      ]);

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Journey',
      });

      expect(result.content[0].text).toContain('[not_found]');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => getJourneyTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should reject invalid realm', () => {
      expect(() => getJourneyTool.inputSchema.realm.parse('invalid')).toThrow();
    });

    it('should use safePathSegmentSchema for journeyName', () => {
      const schema = getJourneyTool.inputSchema.journeyName;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('ValidJourney')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      { status: 401, desc: '401 Unauthorized', category: 'unauthorized' },
      { status: 404, desc: '404 Not Found', category: 'not_found' },
    ])('should handle $desc with error category', async ({ status, category }) => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status });
        })
      );

      const result = await getJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'NonexistentJourney',
      });

      expect(result.content[0].text).toContain('Failed to get journey');
      expect(result.content[0].text).toContain(`[${category}]`);
    });
  });
});
