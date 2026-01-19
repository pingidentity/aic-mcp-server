import { describe, it } from 'vitest';
import { setDefaultJourneyTool } from '../../../src/tools/am/setDefaultJourney.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('setDefaultJourney', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('setDefaultJourney', setDefaultJourneyTool);
  });
});
