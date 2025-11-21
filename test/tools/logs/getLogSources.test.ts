import { describe, it, expect } from 'vitest';
import { getLogSourcesTool } from '../../../src/tools/logs/getLogSources.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('getLogSources', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getLogSources', getLogSourcesTool);
  });

  it('should have correct tool name', () => {
    expect(getLogSourcesTool.name).toBe('getLogSources');
  });
});
