import { describe, it, expect } from 'vitest';
import { updateScriptTool } from '../../../src/tools/am/updateScript.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import { mockScripts } from '../../mocks/mockData.js';

describe('updateScript', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateScript', updateScriptTool);
  });

  // ===== APPLICATION LOGIC TESTS =====
  describe('Application Logic', () => {
    it('should reject when no update fields provided', async () => {
      const result = await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123'
      });

      expect(result.content[0].text).toContain('No updates provided');
      expect(getSpy()).not.toHaveBeenCalled();
    });

    it('should fetch current script first (GET then PUT)', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json(mockScripts.scriptedDecisionNode);
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({ _id: 'script-123', name: 'UpdatedName' });
        })
      );

      await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'UpdatedName'
      });

      const calls = getSpy().mock.calls;
      expect(calls.length).toBe(2);
      expect(calls[0][2]?.method).toBe('GET');
      expect(calls[1][2]?.method).toBe('PUT');
    });

    it('should preserve unchanged fields from current script', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({
            _id: 'script-123',
            name: 'OriginalName',
            description: 'Original desc',
            script: Buffer.from('original code').toString('base64'),
            language: 'JAVASCRIPT',
            context: 'AUTHENTICATION_TREE_DECISION_NODE'
          });
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({ _id: 'script-123', name: 'NewName' });
        })
      );

      await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'NewName'
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.name).toBe('NewName');
      expect(putBody.description).toBe('Original desc');
      expect(putBody.language).toBe('JAVASCRIPT');
    });

    it('should encode script content when provided', async () => {
      const newScriptContent = 'console.log("updated");';

      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json(mockScripts.scriptedDecisionNode);
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({ _id: 'script-123', name: 'TestScript' });
        })
      );

      await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        script: newScriptContent
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      const decoded = Buffer.from(putBody.script, 'base64').toString();
      expect(decoded).toBe(newScriptContent);
    });

    it('should keep existing script content when not updating script', async () => {
      const existingBase64 = Buffer.from('existing code').toString('base64');

      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({
            _id: 'script-123',
            name: 'OriginalName',
            script: existingBase64,
            language: 'JAVASCRIPT'
          });
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({ _id: 'script-123', name: 'NewName' });
        })
      );

      await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'NewName'
      });

      const putBody = JSON.parse(getSpy().mock.calls[1][2].body);
      expect(putBody.script).toBe(existingBase64);
    });
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build URL with encoded scriptId', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json(mockScripts.scriptedDecisionNode);
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({ _id: 'script-123', name: 'TestScript' });
        })
      );

      await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'NewName'
      });

      const url = getSpy().mock.calls[0][0];
      expect(url).toContain('/am/json/alpha/scripts/script-123');
    });

    it('should use PUT method for update', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json(mockScripts.scriptedDecisionNode);
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({ _id: 'script-123', name: 'TestScript' });
        })
      );

      await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'NewName'
      });

      const putOptions = getSpy().mock.calls[1][2];
      expect(putOptions?.method).toBe('PUT');
    });

    it('should pass correct scopes', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json(mockScripts.scriptedDecisionNode);
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({ _id: 'script-123', name: 'TestScript' });
        })
      );

      await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'NewName'
      });

      expect(getSpy().mock.calls[0][1]).toEqual(['fr:am:*']);
      expect(getSpy().mock.calls[1][1]).toEqual(['fr:am:*']);
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should format success message', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json(mockScripts.scriptedDecisionNode);
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json({ _id: 'script-123', name: 'UpdatedScript' });
        })
      );

      const result = await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'UpdatedScript'
      });

      expect(result.content[0].text).toContain('updated successfully');
    });
  });

  // ===== INPUT VALIDATION TESTS =====
  describe('Input Validation', () => {
    it('should require realm parameter', () => {
      expect(() => updateScriptTool.inputSchema.realm.parse(undefined)).toThrow();
    });

    it('should validate scriptId with safePathSegmentSchema', () => {
      const schema = updateScriptTool.inputSchema.scriptId;
      expect(() => schema.parse('../etc/passwd')).toThrow(/path traversal/);
      expect(() => schema.parse('')).toThrow(/cannot be empty/);
      expect(() => schema.parse('valid-id')).not.toThrow();
    });

    it('should accept optional name, description, script', () => {
      expect(updateScriptTool.inputSchema.name.parse(undefined)).toBeUndefined();
      expect(updateScriptTool.inputSchema.description.parse(undefined)).toBeUndefined();
      expect(updateScriptTool.inputSchema.script.parse(undefined)).toBeUndefined();
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should handle 401 error on GET', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'NewName'
      });

      expect(result.content[0].text).toContain('Failed to update script');
    });

    it('should handle 401 error on PUT', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.json(mockScripts.scriptedDecisionNode);
        }),
        http.put('https://*/am/json/*/scripts/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      const result = await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'NewName'
      });

      expect(result.content[0].text).toContain('Failed to update script');
    });

    it('should handle 404 error (script not found)', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return new HttpResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
        })
      );

      const result = await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'nonexistent',
        name: 'NewName'
      });

      expect(result.content[0].text).toContain('Failed to update script');
    });

    it('should handle network error', async () => {
      server.use(
        http.get('https://*/am/json/*/scripts/*', () => {
          return HttpResponse.error();
        })
      );

      const result = await updateScriptTool.toolFunction({
        realm: 'alpha',
        scriptId: 'script-123',
        name: 'NewName'
      });

      expect(result.content[0].text).toContain('Failed to update script');
    });
  });
});
