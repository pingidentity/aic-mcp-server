import { describe, it, expect, beforeEach } from 'vitest';
import { queryManagedObjectsTool } from '../../../src/tools/managedObjects/queryManagedObjects.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('queryManagedObjects', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryManagedObjects', queryManagedObjectsTool);
  });

  it('should have correct tool name', () => {
    expect(queryManagedObjectsTool.name).toBe('queryManagedObjects');
  });

  it('should query successfully', async () => {
    const result = await queryManagedObjectsTool.toolFunction({
      objectType: 'alpha_user',
      queryTerm: 'test',
    });

    expect(result.content).toHaveLength(1);
    const response = JSON.parse(result.content[0].text);
    expect(response).toHaveProperty('result');
    expect(Array.isArray(response.result)).toBe(true);
  });
});
