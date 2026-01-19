import { describe, it } from 'vitest';
import { deleteJourneyTool } from '../../../src/tools/am/deleteJourney.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('deleteJourney', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('deleteJourney', deleteJourneyTool);
  });
});
