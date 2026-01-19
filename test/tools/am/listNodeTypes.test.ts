import { describe, it } from 'vitest';
import { listNodeTypesTool } from '../../../src/tools/am/listNodeTypes.js';
import { snapshotTest } from '../../helpers/snapshotTest.js';

describe('listNodeTypes', () => {
  it('should match tool schema snapshot', async () => {
    await snapshotTest('listNodeTypes', listNodeTypesTool);
  });
});
