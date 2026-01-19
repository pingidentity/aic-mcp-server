import { describe, it } from 'vitest';
import { saveJourneyTool } from '../../../src/tools/am/saveJourney.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('saveJourney', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('saveJourney', saveJourneyTool);
  });
});
