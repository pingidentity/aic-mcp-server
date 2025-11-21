import { describe, it, expect, beforeEach } from 'vitest';
import { getThemesTool } from '../../../src/tools/themes/getThemes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('getThemes', () => {
  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  it('should match tool schema snapshot', async () => {
    await snapshotTest('getThemes', getThemesTool);
  });

  it('should have correct tool name', () => {
    expect(getThemesTool.name).toBe('getThemes');
  });
});
