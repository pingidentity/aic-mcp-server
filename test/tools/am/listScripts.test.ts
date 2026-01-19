import { describe, it } from 'vitest';
import { listScriptsTool } from '../../../src/tools/am/listScripts.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('listScripts', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listScripts', listScriptsTool);
  });
});
