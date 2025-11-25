import { beforeEach, afterEach, vi } from 'vitest';
import * as apiHelpers from '../../src/utils/apiHelpers.js';

/**
 * Sets up standard test environment for tool tests
 * - Sets AIC_BASE_URL to test value
 * - Creates spy on makeAuthenticatedRequest
 * - Automatically restores spy after each test
 *
 * @returns Function to access the current spy instance
 *
 * @example
 * ```typescript
 * describe('myTool', () => {
 *   const getSpy = setupTestEnvironment();
 *
 *   it('should call API correctly', async () => {
 *     await myTool.toolFunction({ ... });
 *     expect(getSpy()).toHaveBeenCalledWith(...);
 *   });
 * });
 * ```
 */
export function setupTestEnvironment() {
  let makeAuthenticatedRequestSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    makeAuthenticatedRequestSpy = vi.spyOn(apiHelpers, 'makeAuthenticatedRequest');
  });

  afterEach(() => {
    makeAuthenticatedRequestSpy.mockRestore();
  });

  // Return getter function so tests can access the spy
  // The spy is recreated in beforeEach, so we need a function to get the current instance
  return () => makeAuthenticatedRequestSpy;
}
