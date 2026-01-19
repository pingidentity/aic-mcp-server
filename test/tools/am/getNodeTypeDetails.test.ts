import { describe, it } from 'vitest';
import { getNodeTypeDetailsTool } from '../../../src/tools/am/getNodeTypeDetails.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('getNodeTypeDetails', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('getNodeTypeDetails', getNodeTypeDetailsTool);
  });
});
