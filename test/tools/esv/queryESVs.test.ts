import { describe, it, expect, beforeEach } from 'vitest';
import { queryESVsTool } from '../../../src/tools/esv/queryESVs.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('queryESVs', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryESVs', queryESVsTool);
  });

  it('should have correct tool name', () => {
    expect(queryESVsTool.name).toBe('queryESVs');
  });
});
