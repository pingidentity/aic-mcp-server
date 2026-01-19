import { describe, it } from 'vitest';
import { createScriptTool } from '../../../src/tools/am/createScript.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('createScript', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('createScript', createScriptTool);
  });
});
