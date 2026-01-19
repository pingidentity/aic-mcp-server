import { describe, it } from 'vitest';
import { updateJourneyNodeTool } from '../../../src/tools/am/updateJourneyNode.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('updateJourneyNode', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('updateJourneyNode', updateJourneyNodeTool);
  });
});
