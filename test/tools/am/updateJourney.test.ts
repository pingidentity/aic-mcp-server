import { describe, it, expect } from 'vitest';
import { updateJourneyTool } from '../../../src/tools/am/updateJourney.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import { mockJourneyData } from '../../mocks/mockData.js';
import { UUID_REGEX, STATIC_NODE_IDS, JourneyNodeInput } from '../../../src/utils/amHelpers.js';

describe('updateJourney', () => {
  const getSpy = setupTestEnvironment();

  const multiNodeReplacement: Record<string, JourneyNodeInput> = {
    collector: {
      nodeType: 'UsernameCollectorNode',
      displayName: 'Username',
      connections: { outcome: 'decision' },
      config: {}
    },
    decision: {
      nodeType: 'DataStoreDecisionNode',
      displayName: 'Data Store',
      connections: { true: 'success', false: 'failure' },
      config: {}
    }
  };

  /**
   * Registers MSW handlers that return the `withMetadata` fixture on GET and a
   * minimal success body on PUT. Individual tests can still override via
   * `server.use(...)` after this.
   */
  function mockGetAndPut(fetched: Record<string, unknown> = mockJourneyData.withMetadata) {
    server.use(
      http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
        return HttpResponse.json(fetched);
      }),
      http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
        return HttpResponse.json({ _id: (fetched as { _id?: string })._id ?? 'UpdatedJourney' });
      })
    );
  }

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateJourney', updateJourneyTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should reject when no update fields provided', async () => {
      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta'
      });

      expect(result.content[0].text).toContain('No updates provided');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should reject entryNodeId without nodes (metadata-only path)', async () => {
      mockGetAndPut();

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        entryNodeId: 'some-node'
      });

      expect(result.content[0].text).toContain(
        '"entryNodeId" can only be updated together with a full "nodes" graph replacement.'
      );
      // Guard runs after GET (GET happens before payload construction), so no PUT should be issued.
      const putCalls = getSpy().mock.calls.filter((c) => c[2]?.method === 'PUT');
      expect(putCalls.length).toBe(0);
    });

    it('should reject nodes without entryNodeId (graph-replacement path)', async () => {
      mockGetAndPut();

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        nodes: multiNodeReplacement
      });

      expect(result.content[0].text).toContain(
        'When providing "nodes" for graph replacement, "entryNodeId" must also be provided.'
      );
      const putCalls = getSpy().mock.calls.filter((c) => c[2]?.method === 'PUT');
      expect(putCalls.length).toBe(0);
    });

    it('should fetch current journey first (GET then PUT)', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'Updated description'
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[1][2]?.method).toBe('PUT');
    });

    it('should preserve all fetched fields when only metadata is updated (wide-spread merge)', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'New description'
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      // New value overwrites old
      expect(putBody.description).toBe('New description');
      // Everything else preserved from GET
      expect(putBody._id).toBe('JourneyWithMeta');
      expect(putBody.entryNodeId).toBe('existing-node-uuid');
      expect(putBody.nodes).toEqual(mockJourneyData.withMetadata.nodes);
      expect(putBody.staticNodes).toEqual(mockJourneyData.withMetadata.staticNodes);
      expect(putBody.identityResource).toBe('managed/alpha_user');
      expect(putBody.mustRun).toBe(true);
      expect(putBody.innerTreeOnly).toBe(false);
      expect(putBody.uiConfig).toEqual({ displayName: 'Existing Journey' });
      expect(putBody.enabled).toBe(true);
      expect(putBody.maximumSessionTime).toBe(120);
      expect(putBody.maximumIdleTime).toBe(30);
    });

    it('should include identityResource when provided, preserving other fields', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        identityResource: 'managed/bravo_user'
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.identityResource).toBe('managed/bravo_user');
      expect(putBody.description).toBe('Existing description');
      expect(putBody.enabled).toBe(true);
    });

    it('should preserve falsy-but-legal values (mustRun: false, maximumSessionTime: 0)', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        mustRun: false,
        maximumSessionTime: 0,
        enabled: false
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      // `!== undefined` guard must allow falsy legal values through
      expect(putBody.mustRun).toBe(false);
      expect(putBody.maximumSessionTime).toBe(0);
      expect(putBody.enabled).toBe(false);
      expect('mustRun' in putBody).toBe(true);
      expect('maximumSessionTime' in putBody).toBe(true);
      expect('enabled' in putBody).toBe(true);
    });

    it('should strip _rev from fetched journey before PUT (AM rejects it)', async () => {
      mockGetAndPut({
        ...mockJourneyData.withMetadata,
        _rev: '682102924'
      });

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'Updated description'
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect('_rev' in putBody).toBe(false);
      // Other fetched fields should still be preserved
      expect(putBody._id).toBe('JourneyWithMeta');
      expect(putBody.description).toBe('Updated description');
    });

    it('should omit metadata keys not provided by caller (no undefined leakage)', async () => {
      mockGetAndPut({
        _id: 'BareJourney',
        entryNodeId: 'node-a',
        nodes: {
          'node-a': {
            nodeType: 'UsernameCollectorNode',
            displayName: 'Collector',
            connections: { outcome: 'success' },
            config: { _id: 'node-a' }
          }
        },
        staticNodes: {}
      });

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'BareJourney',
        description: 'Only this'
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.description).toBe('Only this');
      // Metadata keys not provided by caller and not present in GET response must not appear
      expect('identityResource' in putBody).toBe(false);
      expect('mustRun' in putBody).toBe(false);
      expect('innerTreeOnly' in putBody).toBe(false);
      expect('uiConfig' in putBody).toBe(false);
      expect('enabled' in putBody).toBe(false);
      expect('maximumSessionTime' in putBody).toBe(false);
      expect('maximumIdleTime' in putBody).toBe(false);
    });

    it('should run UUID transformation pipeline when graph is replaced', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        entryNodeId: 'collector',
        nodes: multiNodeReplacement
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      // entryNodeId transformed to UUID
      expect(putBody.entryNodeId).not.toBe('collector');
      expect(UUID_REGEX.test(putBody.entryNodeId)).toBe(true);

      // Node keys transformed to UUIDs
      const nodeKeys = Object.keys(putBody.nodes);
      expect(nodeKeys.length).toBe(2);
      for (const key of nodeKeys) {
        expect(UUID_REGEX.test(key)).toBe(true);
      }

      // "success" / "failure" aliases resolved to static node IDs
      const decisionKey = nodeKeys.find((k) => putBody.nodes[k].nodeType === 'DataStoreDecisionNode')!;
      expect(putBody.nodes[decisionKey].connections.true).toBe(STATIC_NODE_IDS.SUCCESS);
      expect(putBody.nodes[decisionKey].connections.false).toBe(STATIC_NODE_IDS.FAILURE);

      // staticNodes populated by transformer
      expect(putBody.staticNodes).toBeDefined();
      expect(putBody.staticNodes.startNode).toBeDefined();
    });

    it('should replace graph and still apply metadata overrides on top', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        entryNodeId: 'collector',
        nodes: multiNodeReplacement,
        description: 'Replaced graph',
        identityResource: 'managed/bravo_user'
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      // Metadata overrides present
      expect(putBody.description).toBe('Replaced graph');
      expect(putBody.identityResource).toBe('managed/bravo_user');
      // Non-overridden metadata preserved from fetched journey
      expect(putBody.mustRun).toBe(true);
      expect(putBody.enabled).toBe(true);
      // Graph replaced with new UUIDs (not the fetched 'existing-node-uuid')
      expect(putBody.entryNodeId).not.toBe('existing-node-uuid');
      expect(UUID_REGEX.test(putBody.entryNodeId)).toBe(true);
      expect(Object.keys(putBody.nodes)).not.toContain('existing-node-uuid');
    });

    it('should return nodeIdMapping in response when graph is replaced', async () => {
      mockGetAndPut();

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        entryNodeId: 'collector',
        nodes: multiNodeReplacement
      });

      const text = result.content[0].text;
      expect(text).toContain('nodeIdMapping');
      expect(text).toContain('collector');
      expect(text).toContain('decision');
      expect(text).toContain('journeyName');
      expect(text).toContain('JourneyWithMeta');
    });

    it('should not include nodeIdMapping in response for metadata-only updates', async () => {
      mockGetAndPut();

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'metadata only'
      });

      const text = result.content[0].text;
      expect(text).not.toContain('nodeIdMapping');
      expect(text).toContain('journeyName');
      expect(text).toContain('JourneyWithMeta');
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with encoded journeyName', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Copy of Login',
        description: 'renamed'
      });

      const getUrl = getSpy().mock.calls[0][0];
      const putUrl = getSpy().mock.calls[1][0];
      expect(getUrl).toContain(
        '/am/json/alpha/realm-config/authentication/authenticationtrees/trees/Copy%20of%20Login'
      );
      expect(putUrl).toContain(
        '/am/json/alpha/realm-config/authentication/authenticationtrees/trees/Copy%20of%20Login'
      );
    });

    it('should use GET then PUT methods', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'updated'
      });

      expect(getSpy().mock.calls[0][2]?.method).toBe('GET');
      expect(getSpy().mock.calls[1][2]?.method).toBe('PUT');
    });

    it('should include AM_API_HEADERS on both GET and PUT', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'updated'
      });

      const getOptions = getSpy().mock.calls[0][2];
      const putOptions = getSpy().mock.calls[1][2];
      expect(getOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
      expect(putOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should pass fr:am:* scope on both GET and PUT', async () => {
      mockGetAndPut();

      await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'updated'
      });

      expect(getSpy().mock.calls[0][1]).toEqual(['fr:am:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:am:*']);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => updateJourneyTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should validate journeyName with safePathSegmentSchema', () => {
      const schema = updateJourneyTool.inputSchema.journeyName;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('ValidJourney')).not.toThrow();
    });

    it('should accept optional description', () => {
      expect(updateJourneyTool.inputSchema.description.parse(undefined)).toBeUndefined();
      expect(updateJourneyTool.inputSchema.description.parse('A description')).toBe('A description');
    });

    it('should accept optional identityResource (string or undefined)', () => {
      expect(updateJourneyTool.inputSchema.identityResource.parse(undefined)).toBeUndefined();
      expect(updateJourneyTool.inputSchema.identityResource.parse('managed/alpha_user')).toBe('managed/alpha_user');
    });

    it('should reject non-string identityResource', () => {
      expect(() => updateJourneyTool.inputSchema.identityResource.parse(42)).toThrow();
      expect(() => updateJourneyTool.inputSchema.identityResource.parse({})).toThrow();
    });

    it('should accept optional boolean fields', () => {
      expect(updateJourneyTool.inputSchema.mustRun.parse(undefined)).toBeUndefined();
      expect(updateJourneyTool.inputSchema.mustRun.parse(true)).toBe(true);
      expect(updateJourneyTool.inputSchema.mustRun.parse(false)).toBe(false);
      expect(updateJourneyTool.inputSchema.innerTreeOnly.parse(false)).toBe(false);
      expect(updateJourneyTool.inputSchema.enabled.parse(true)).toBe(true);
    });

    it('should reject non-boolean values for boolean fields', () => {
      expect(() => updateJourneyTool.inputSchema.mustRun.parse('true')).toThrow();
      expect(() => updateJourneyTool.inputSchema.enabled.parse(1)).toThrow();
    });

    it('should accept optional number fields', () => {
      expect(updateJourneyTool.inputSchema.maximumSessionTime.parse(undefined)).toBeUndefined();
      expect(updateJourneyTool.inputSchema.maximumSessionTime.parse(60)).toBe(60);
      expect(updateJourneyTool.inputSchema.maximumIdleTime.parse(0)).toBe(0);
    });

    it('should accept optional uiConfig record', () => {
      expect(updateJourneyTool.inputSchema.uiConfig.parse(undefined)).toBeUndefined();
      expect(updateJourneyTool.inputSchema.uiConfig.parse({ a: 1 })).toEqual({ a: 1 });
    });

    it('should accept optional entryNodeId and nodes', () => {
      expect(updateJourneyTool.inputSchema.entryNodeId.parse(undefined)).toBeUndefined();
      expect(updateJourneyTool.inputSchema.nodes.parse(undefined)).toBeUndefined();
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should return a success shape for metadata-only updates', async () => {
      mockGetAndPut();

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'updated'
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('"success": true');
      expect(result.content[0].text).toContain('"journeyName": "JourneyWithMeta"');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 error on GET', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'updated'
      });

      expect(result.content[0].text).toContain('[unauthorized]');
      expect(result.content[0].text).toContain('Failed to update journey "JourneyWithMeta"');
    });

    it('should handle 404 error on GET (journey not found)', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'MissingJourney',
        description: 'updated'
      });

      expect(result.content[0].text).toContain('Failed to update journey "MissingJourney"');
    });

    it('should handle 401 error on PUT', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json(mockJourneyData.withMetadata);
        }),
        http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'updated'
      });

      expect(result.content[0].text).toContain('[unauthorized]');
      expect(result.content[0].text).toContain('Failed to update journey');
    });

    it('should handle 400 error on PUT (invalid payload)', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.json(mockJourneyData.withMetadata);
        }),
        http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        identityResource: 'bogus/value'
      });

      expect(result.content[0].text).toContain('[invalid_request]');
      expect(result.content[0].text).toContain('Failed to update journey');
    });

    it('should handle network error', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.error();
        })
      );

      const result = await updateJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'JourneyWithMeta',
        description: 'updated'
      });

      expect(result.content[0].text).toContain('[transient]');
      expect(result.content[0].text).toContain('Failed to update journey');
    });
  });
});
