import { describe, it, expect, beforeEach } from 'vitest';
import { queryVariablesTool } from '../../../src/tools/esv/queryVariables.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('queryVariables', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  it('should match tool schema snapshot', async () => {
    await snapshotTest('queryVariables', queryVariablesTool);
  });

  it('should have correct tool name', () => {
    expect(queryVariablesTool.name).toBe('queryVariables');
  });
});
