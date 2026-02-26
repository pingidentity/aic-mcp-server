import { describe, it, expect } from 'vitest';
import { getDynamicNodeOutcomesTool } from '../../../src/tools/am/getDynamicNodeOutcomes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import { UUID_REGEX } from '../../../src/utils/amHelpers.js';

describe('getDynamicNodeOutcomes', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getDynamicNodeOutcomes', getDynamicNodeOutcomesTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should auto-generate _id for PageNode child nodes without _id', async () => {
      await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'PageNode',
        config: {
          nodes: [{ nodeType: 'UsernameCollectorNode', _properties: {} }]
        }
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody.nodes[0]._id).toBeDefined();
      expect(UUID_REGEX.test(requestBody.nodes[0]._id)).toBe(true);
    });

    it('should preserve existing _id for PageNode child nodes', async () => {
      await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'PageNode',
        config: {
          nodes: [{ _id: 'existing-id', nodeType: 'UsernameCollectorNode', _properties: {} }]
        }
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody.nodes[0]._id).toBe('existing-id');
    });

    it('should pass config as-is for non-PageNode types', async () => {
      await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ChoiceCollectorNode',
        config: { choices: ['option1', 'option2'] }
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody.choices).toEqual(['option1', 'option2']);
    });

    it('should not add _id to top-level config', async () => {
      await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ChoiceCollectorNode',
        config: { choices: ['a'] }
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody._id).toBeUndefined();
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with ?_action=listOutcomes', async () => {
      await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'PageNode',
        config: {}
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('_action=listOutcomes');
    });

    it('should use POST method', async () => {
      await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'PageNode',
        config: {}
      });

      const options = getSpy().mock.calls[0][2];
      expect(options?.method).toBe('POST');
    });

    it('should include encoded nodeType in URL', async () => {
      await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'Node With Spaces',
        config: {}
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('Node%20With%20Spaces');
    });

    it('should pass config in request body', async () => {
      await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'ChoiceCollectorNode',
        config: { choices: ['a', 'b'] }
      });

      const requestBody = JSON.parse(getSpy().mock.calls[0][2].body);
      expect(requestBody.choices).toEqual(['a', 'b']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format response with outcomes', async () => {
      const result = await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'PageNode',
        config: {}
      });

      expect(result.content[0].text).toBeDefined();
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => getDynamicNodeOutcomesTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should require nodeType parameter', () => {
      expect(() => getDynamicNodeOutcomesTool.inputSchema.nodeType.parse('')).toThrow();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 400 error (invalid config)', async () => {
      server.use(
        http.post('https://*/am/json/*/realm-config/authentication/authenticationtrees/nodes/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'invalid config' }), { status: 400 });
        })
      );

      const result = await getDynamicNodeOutcomesTool.toolFunction({
        realm: 'alpha',
        nodeType: 'PageNode',
        config: {}
      });

      expect(result.content[0].text).toContain('Failed to get dynamic outcomes');
    });
  });
});
