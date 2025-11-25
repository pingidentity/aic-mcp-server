import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { listManagedObjectsTool } from '../../../src/tools/managedObjects/listManagedObjects.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';
import { server } from '../../setup.js';
import { http, HttpResponse } from 'msw';
import * as apiHelpers from '../../../src/utils/apiHelpers.js';

describe('listManagedObjects', () => {
  let makeAuthenticatedRequestSpy: any;

  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    makeAuthenticatedRequestSpy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
  });

  afterEach(() => {
    makeAuthenticatedRequestSpy.mockRestore();
  });

  // ===== SNAPSHOT TEST =====
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listManagedObjects', listManagedObjectsTool);
  });

  // ===== REQUEST CONSTRUCTION TESTS =====
  describe('Request Construction', () => {
    it('should call config managed endpoint', async () => {
      await listManagedObjectsTool.toolFunction();

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        'https://test.forgeblocks.com/openidm/config/managed',
        ['fr:idm:*']
      );
    });

    it('should pass correct scopes to auth', async () => {
      await listManagedObjectsTool.toolFunction();

      expect(makeAuthenticatedRequestSpy).toHaveBeenCalledWith(
        expect.any(String),
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
    it('should handle 401 Unauthorized error', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return new HttpResponse(
            JSON.stringify({ error: 'unauthorized' }),
            { status: 401 }
          );
        })
      );

      const result = await listManagedObjectsTool.toolFunction();
      expect(result.content[0].text).toContain('Error listing managed objects');
      expect(result.content[0].text).toContain('401');
    });

    it('should handle network error', async () => {
      server.use(
        http.get('https://*/openidm/config/managed', () => {
          return HttpResponse.error();
        })
      );

      const result = await listManagedObjectsTool.toolFunction();
      expect(result.content[0].text).toMatch(/Error listing managed objects/i);
    });
  });
});
