import { describe, it } from 'vitest';
import { deleteJourneyNodesTool } from '../../../src/tools/am/deleteJourneyNodes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('deleteJourneyNodes', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteJourneyNodes', deleteJourneyNodesTool);
  });
});
