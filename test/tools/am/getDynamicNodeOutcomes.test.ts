import { describe, it } from 'vitest';
import { getDynamicNodeOutcomesTool } from '../../../src/tools/am/getDynamicNodeOutcomes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('getDynamicNodeOutcomes', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getDynamicNodeOutcomes', getDynamicNodeOutcomesTool);
  });
});
