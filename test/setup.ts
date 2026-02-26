import { beforeAll, afterEach, afterAll, vi } from 'vitest';

// ===== MOCKS MUST BE FIRST (vi.mock is hoisted) =====

// Mock keytar globally (system keychain access)
// Provide a valid cached token to avoid triggering OAuth flow
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn().mockResolvedValue(undefined),
    getPassword: vi.fn().mockResolvedValue(
      JSON.stringify({
        accessToken: 'mock-token',
        expiresAt: Date.now() + 3600000, // Expires in 1 hour
        aicBaseUrl: 'test.forgeblocks.com'
      })
    ),
    deletePassword: vi.fn().mockResolvedValue(true)
  }
}));

// Mock 'open' package (browser launching)
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined)
}));

// Mock debug module (used internally by some packages)
vi.mock('debug', () => ({
  default: () => vi.fn()
}));

// ===== NOW SAFE TO IMPORT MODULES =====

import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers.js';
import { initAuthService } from '../src/services/authService.js';
import { getAllScopes } from '../src/utils/toolHelpers.js';

// Initialize AuthService IMMEDIATELY at module level (before any tests run)
// Use shared utility to collect all scopes (same as src/index.ts)
const allScopes = getAllScopes();

// Initialize auth service with all scopes and test config
// Allow cached tokens on first request to avoid triggering OAuth flow in tests
initAuthService(allScopes, { allowCachedOnFirstRequest: true });

// Create MSW server with all handlers
export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'warn' // Warn on unmocked requests (helps debug)
  });
});

// Reset handlers after each test to prevent cross-test contamination
afterEach(() => {
  server.resetHandlers();
});

// Clean shutdown after all tests
afterAll(() => {
  server.close();
});
