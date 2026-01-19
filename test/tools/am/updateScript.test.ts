import { describe, it } from 'vitest';
import { updateScriptTool } from '../../../src/tools/am/updateScript.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('updateScript', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateScript', updateScriptTool);
  });
});
