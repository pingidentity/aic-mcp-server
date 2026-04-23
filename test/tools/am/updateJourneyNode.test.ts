import { describe, it, expect } from 'vitest';
import { updateJourneyNodeTool } from '../../../src/tools/am/updateJourneyNode.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('updateJourneyNode', () => {
  const getSpy = setupTestEnvironment();

  // A valid UUID for tests — nodeId is now validated as z.string().uuid()
  const TEST_NODE_ID = '12345678-1234-1234-1234-123456789abc';

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateJourneyNode', updateJourneyNodeTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should inject _id into config', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: { prop: 'value' }
      });

      // calls[0] is the pre-flight GET; calls[1] is the PUT
      const putCall = getSpy().mock.calls[1];
      const requestBody = JSON.parse(putCall[2].body);
      expect(requestBody._id).toBe(TEST_NODE_ID);
      expect(requestBody.prop).toBe('value');
    });

    it('should override _id if present in config', async () => {
      const otherUuid = '87654321-4321-4321-4321-cba987654321';
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: { _id: otherUuid, prop: 'value' }
      });

      const putCall = getSpy().mock.calls[1];
      const requestBody = JSON.parse(putCall[2].body);
      // { _id: nodeId, ...config } means config._id overrides the injected _id
      expect(requestBody._id).toBe(otherUuid);
      expect(requestBody.prop).toBe('value');
    });

    it('should issue pre-flight GET before PUT', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: { prop: 'value' }
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[1][2]?.method).toBe('PUT');
    });

    it('should return not_found error when node does not exist (pre-flight GET 404)', async () => {
      server.use(
        http.get('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: { prop: 'value' }
      });

      expect(result.content[0].text).toContain('[not_found]');
      expect(result.content[0].text).toContain(`Failed to update node "${TEST_NODE_ID}"`);

      // PUT must not have been issued after the pre-flight GET failed
      const putCalls = getSpy().mock.calls.filter((c) => c[2]?.method === 'PUT');
      expect(putCalls.length).toBe(0);
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with nodeType and nodeId', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: { prop: 'value' }
      });

      const putUrl = getSpy().mock.calls[1][0];
      expect(putUrl).toContain(
        `/realm-config/authentication/authenticationtrees/nodes/ScriptedDecisionNode/${TEST_NODE_ID}`
      );
    });

    it('should use PUT method for the update call', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: {}
      });

      const options = getSpy().mock.calls[1][2];
      expect(options?.method).toBe('PUT');
    });

    it('should include AM_API_HEADERS on both GET and PUT', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: {}
      });

      const getOptions = getSpy().mock.calls[0][2];
      const putOptions = getSpy().mock.calls[1][2];
      expect(getOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
      expect(putOptions?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should pass correct scopes', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: {}
      });

      expect(getSpy().mock.calls[0][1]).toEqual(['fr:am:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format success message', async () => {
      const result = await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: {}
      });

      expect(result.content[0].text).toContain(TEST_NODE_ID);
      expect(result.content[0].text).toContain('success');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => updateJourneyNodeTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should validate nodeType with safePathSegmentSchema', () => {
      const schema = updateJourneyNodeTool.inputSchema.nodeType;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('ValidNodeType')).not.toThrow();
    });

    it('should validate nodeId as a UUID', () => {
      const schema = updateJourneyNodeTool.inputSchema.nodeId;
      expect(() => schema.parse('not-a-uuid')).toThrow();
      expect(() => schema.parse('')).toThrow();
      expect(() => schema.parse('../etc/passwd')).toThrow();
      expect(() => schema.parse(TEST_NODE_ID)).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should categorize errors in message', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status: 500 });
        })
      );

      const result = await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: TEST_NODE_ID,
        config: {}
      });

      expect(result.content[0].text).toContain('[transient]');
    });
  });
});
