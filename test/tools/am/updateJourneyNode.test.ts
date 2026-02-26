import { describe, it, expect } from 'vitest';
import { updateJourneyNodeTool } from '../../../src/tools/am/updateJourneyNode.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('updateJourneyNode', () => {
  const getSpy = setupTestEnvironment();

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
        nodeId: 'node-123',
        config: { prop: 'value' },
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody._id).toBe('node-123');
      expect(requestBody.prop).toBe('value');
    });

    it('should override _id if present in config', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: 'correct-id',
        config: { _id: 'wrong-id', prop: 'value' },
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      // { _id: nodeId, ...config } means config._id overrides the injected _id
      expect(requestBody._id).toBe('wrong-id');
      expect(requestBody.prop).toBe('value');
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with nodeType and nodeId', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: 'node-123',
        config: { prop: 'value' },
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/realm-config/authentication/authenticationtrees/nodes/ScriptedDecisionNode/node-123');
    });

    it('should use PUT method', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: 'node-123',
        config: {},
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('PUT');
    });

    it('should include AM_API_HEADERS', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: 'node-123',
        config: {},
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.headers?.['accept-api-version']).toBe('protocol=2.1,resource=1.0');
    });

    it('should pass correct scopes', async () => {
      await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: 'node-123',
        config: {},
      });

      const scopes = getSpy().mock.calls[0][1];
      expect(scopes).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format success message', async () => {
      const result = await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: 'node-123',
        config: {},
      });

      expect(result.content[0].text).toContain('node-123');
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

    it('should validate nodeId with safePathSegmentSchema', () => {
      const schema = updateJourneyNodeTool.inputSchema.nodeId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('valid-node-id')).not.toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should categorize errors in message', async () => {
      server.use(
        http.put('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'error' }), { status: 404 });
        })
      );

      const result = await updateJourneyNodeTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ScriptedDecisionNode',
        nodeId: 'nonexistent',
        config: {},
      });

      expect(result.content[0].text).toContain('[not_found]');
    });
  });
});
