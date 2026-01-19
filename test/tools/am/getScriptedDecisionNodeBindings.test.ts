import { describe, it } from 'vitest';
import { getScriptedDecisionNodeBindingsTool } from '../../../src/tools/am/getScriptedDecisionNodeBindings.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('getScriptedDecisionNodeBindings', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getScriptedDecisionNodeBindings', getScriptedDecisionNodeBindingsTool);
  });
});
