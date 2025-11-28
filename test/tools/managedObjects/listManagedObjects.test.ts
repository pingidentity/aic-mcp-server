import { describe, it, expect } from 'vitest';
import { listManagedObjectsTool } from '../../../src/tools/managedObjects/listManagedObjects.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { setupTestEnvironment } from '../../helpers/testEnvironment.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';

describe('listManagedObjects', () => {
  const getSpy = setupTestEnvironment();

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listManagedObjects', listManagedObjectsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should build request with URL and scopes', async () => {
      await listManagedObjectsTool.toolFunction();

      expect(getSpy()).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/openidm/config/managed',
        ['fr:idm:*']
      );
    });
  });

  // ===== RESPONSE HANDLING TESTS =====
  describe('Response Handling', () => {
    it('should extract and return only object names', async () => {
      const result = await listManagedObjectsTool.toolFunction();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('managedObjectTypes');
      expect(Array.isArray(response.managedObjectTypes)).toBe(true);
      expect(response.managedObjectTypes).toContain('alpha_user');
      expect(response.managedObjectTypes).toContain('bravo_role');
      expect(response.managedObjectTypes).toContain('alpha_device');
    });

    it('should handle empty objects array', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({ objects: [] });
        })
      );

      const result = await listManagedObjectsTool.toolFunction();
      const response = JSON.parse(result.content[0].text);
      expect(response.managedObjectTypes).toEqual([]);
    });

    it('should handle missing objects property', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.json({});
        })
      );

      const result = await listManagedObjectsTool.toolFunction();
      const response = JSON.parse(result.content[0].text);
      expect(response.managedObjectTypes).toEqual([]);
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it.each([
      {
        name: 'should handle 401 Unauthorized error',
        handler: () => new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
        matcher: /Error listing managed objects.*401/s,
      },
      {
        name: 'should handle network error',
        handler: () => HttpResponse.error(),
        matcher: /Error listing managed objects/i,
      },
    ])('$name', async ({ handler, matcher }) => {
      server.use(http.get('https://*/openidm/config/managed', handler));

      const result = await listManagedObjectsTool.toolFunction();
      expect(result.content[0].text).toMatch(matcher);
    });
  });
});
