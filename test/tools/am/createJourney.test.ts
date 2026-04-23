import { describe, it, expect } from 'vitest';
import { createJourneyTool } from '../../../src/tools/am/createJourney.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import { UUID_REGEX, STATIC_NODE_IDS, JourneyInput } from '../../../src/utils/amHelpers.js';

describe('createJourney', () => {
  const getSpy = setupTestEnvironment();

  const simpleJourneyData: JourneyInput = {
    entryNodeId: 'login',
    nodes: {
      login: {
        nodeType: 'UsernameCollectorNode',
        displayName: 'Collect Username',
        connections: { outcome: 'success' },
        config: { prop: 'value' }
      }
    }
  };

  const multiNodeJourneyData: JourneyInput = {
    entryNodeId: 'collector',
    nodes: {
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
    }
  };

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createJourney', createJourneyTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should validate connection targets before making API call', async () => {
      const result = await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: {
          entryNodeId: 'nonexistent',
          nodes: {
            login: {
              nodeType: 'UsernameCollectorNode',
              displayName: 'Login',
              connections: { outcome: 'success' },
              config: {}
            }
          }
        }
      });

      expect(result.content[0].text).toContain('Invalid journey structure');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should reject self-referencing connections', async () => {
      const result = await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: {
          entryNodeId: 'login',
          nodes: {
            login: {
              nodeType: 'UsernameCollectorNode',
              displayName: 'Login',
              connections: { outcome: 'login' },
              config: {}
            }
          }
        }
      });

      expect(result.content[0].text).toContain('Invalid journey structure');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should transform human-readable IDs to UUIDs', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      const nodeKeys = Object.keys(putBody.nodes);
      expect(nodeKeys.length).toBe(1);
      expect(nodeKeys[0]).not.toBe('login');
      expect(UUID_REGEX.test(nodeKeys[0])).toBe(true);
    });

    it('should transform entryNodeId to UUID', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(putBody.entryNodeId).not.toBe('login');
      expect(UUID_REGEX.test(putBody.entryNodeId)).toBe(true);
    });

    it('should transform connection targets to UUIDs', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: multiNodeJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      const collectorNodeKey = Object.keys(putBody.nodes).find(
        (k: string) => putBody.nodes[k].nodeType === 'UsernameCollectorNode'
      );
      const decisionNodeKey = Object.keys(putBody.nodes).find(
        (k: string) => putBody.nodes[k].nodeType === 'DataStoreDecisionNode'
      );
      // Collector should connect to decision
      expect(putBody.nodes[collectorNodeKey!].connections.outcome).toBe(decisionNodeKey);
    });

    it('should resolve "success" and "failure" aliases to static node IDs', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: multiNodeJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      const decisionNodeKey = Object.keys(putBody.nodes).find(
        (k: string) => putBody.nodes[k].nodeType === 'DataStoreDecisionNode'
      );
      expect(putBody.nodes[decisionNodeKey!].connections.true).toBe(STATIC_NODE_IDS.SUCCESS);
      expect(putBody.nodes[decisionNodeKey!].connections.false).toBe(STATIC_NODE_IDS.FAILURE);
    });

    it('should include staticNodes in payload', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(putBody.staticNodes).toBeDefined();
      expect(putBody.staticNodes.startNode).toBeDefined();
    });

    it('should include description when provided', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        description: 'A test journey',
        journeyData: simpleJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(putBody.description).toBe('A test journey');
    });

    it('should omit description when not provided', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(putBody.description).toBeUndefined();
    });

    it('should include identityResource when provided', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        identityResource: 'managed/alpha_user',
        journeyData: simpleJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(putBody.identityResource).toBe('managed/alpha_user');
    });

    it('should omit identityResource when not provided', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const putBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect('identityResource' in putBody).toBe(false);
    });

    it('should return ID mapping in response', async () => {
      const result = await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const text = result.content[0].text;
      expect(text).toContain('nodeIdMapping');
      expect(text).toContain('login');
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with encoded journeyName', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'Copy of Login',
        journeyData: simpleJourneyData
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('Copy%20of%20Login');
    });

    it('should use PUT method', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('PUT');
    });

    it('should include AM_API_HEADERS', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should pass correct scopes', async () => {
      await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => createJourneyTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should validate journeyName with safePathSegmentSchema', () => {
      const schema = createJourneyTool.inputSchema.journeyName;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('ValidJourney')).not.toThrow();
    });

    it('should accept optional description', () => {
      expect(createJourneyTool.inputSchema.description.parse(undefined)).toBeUndefined();
      expect(createJourneyTool.inputSchema.description.parse('A description')).toBe('A description');
    });

    it('should accept optional identityResource', () => {
      expect(createJourneyTool.inputSchema.identityResource.parse(undefined)).toBeUndefined();
      expect(createJourneyTool.inputSchema.identityResource.parse('managed/alpha_user')).toBe('managed/alpha_user');
    });

    it('should require journeyData object', () => {
      expect(() => createJourneyTool.inputSchema.journeyData.parse(undefined)).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should categorize 401 error as unauthorized', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      expect(result.content[0].text).toContain('[unauthorized]');
      expect(result.content[0].text).toContain('Failed to create journey');
    });

    it('should categorize 400 error as invalid_request', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'bad request' }), { status: 400 });
        })
      );

      const result = await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      expect(result.content[0].text).toContain('[invalid_request]');
    });

    it('should handle network error', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/trees/*', () => {
          return HttpResponse.error();
        })
      );

      const result = await createJourneyTool.toolFunction({
        realm: 'alpha',
        journeyName: 'TestJourney',
        journeyData: simpleJourneyData
      });

      expect(result.content[0].text).toContain('[transient]');
      expect(result.content[0].text).toContain('Failed to create journey');
    });
  });
});
