import { describe, it } from 'vitest';
import { deleteScriptTool } from '../../../src/tools/am/deleteScript.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('deleteScript', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteScript', deleteScriptTool);
  });
});
