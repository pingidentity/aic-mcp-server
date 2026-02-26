import { beforeEach, afterEach, vi } from 'vitest';
import { TokenData } from '../../src/services/tokenStorage.js';

/**
 * Mock TokenStorage interface for testing
 */
export interface MockTokenStorage {
  getToken: ReturnType<typeof vi.fn>;
  setToken: ReturnType<typeof vi.fn>;
  deleteToken: ReturnType<typeof vi.fn>;
}

/**
 * Mock MCP Server object for device code flow tests
 */
export interface MockMcpServer {
  server: {
    elicitInput: ReturnType<typeof vi.fn>;
    notification: ReturnType<typeof vi.fn>;
  };
}

/**
 * Creates a mock TokenStorage instance with spy methods
 * @returns Mock TokenStorage interface with vi.fn() spy methods
 *
 * @example
 * ```typescript
 * const mockStorage = createMockTokenStorage();
 * mockStorage.getToken.mockResolvedValue(VALID_TOKEN_DATA);
 * ```
 */
export function createMockTokenStorage(): MockTokenStorage {
  return {
    getToken: vi.fn().mockResolvedValue(null),
    setToken: vi.fn().mockResolvedValue(undefined),
    deleteToken: vi.fn().mockResolvedValue(undefined)
  };
}

/**
 * Creates a mock MCP server object for device code flow tests
 * @returns Mock MCP server with elicitInput and notification methods
 *
 * @example
 * ```typescript
 * const mockServer = createMockMcpServer();
 * mockServer.server.elicitInput.mockResolvedValue({ action: 'accept' });
 * ```
 */
export function createMockMcpServer(): MockMcpServer {
  return {
    server: {
      elicitInput: vi.fn().mockResolvedValue({ action: 'accept' }),
      notification: vi.fn().mockResolvedValue(undefined)
    }
  };
}

/**
 * Factory function to create TokenData objects with sensible defaults
 * @param overrides - Optional partial TokenData to override defaults
 * @returns Complete TokenData object
 *
 * @example
 * ```typescript
 * const expiredToken = createTestTokenData({ expiresAt: Date.now() - 3600000 });
 * const customToken = createTestTokenData({ accessToken: 'custom-token' });
 * ```
 */
export function createTestTokenData(overrides: Partial<TokenData> = {}): TokenData {
  return {
    accessToken: 'test-access-token',
    expiresAt: Date.now() + 3600000, // Expires in 1 hour
    aicBaseUrl: 'test.forgeblocks.com',
    ...overrides
  };
}

// ===== TEST FIXTURES =====

/**
 * Valid token that expires in 1 hour
 */
export const VALID_TOKEN_DATA = createTestTokenData();

/**
 * Token that expired 1 hour ago
 */
export const EXPIRED_TOKEN_DATA = createTestTokenData({
  expiresAt: Date.now() - 3600000
});

/**
 * Token for a different AIC tenant
 */
export const DIFFERENT_TENANT_TOKEN_DATA = createTestTokenData({
  aicBaseUrl: 'different-tenant.forgeblocks.com'
});

/**
 * Standard device code response from OAuth server (RFC 8628)
 */
export const MOCK_DEVICE_CODE_RESPONSE = {
  device_code: 'test-device-code-12345',
  user_code: 'TEST-CODE',
  verification_uri: 'https://test.forgeblocks.com/device',
  verification_uri_complete: 'https://test.forgeblocks.com/device?user_code=TEST-CODE',
  expires_in: 600,
  interval: 5
};

/**
 * Standard token response from OAuth server
 */
export const MOCK_TOKEN_RESPONSE = {
  access_token: 'test-access-token',
  expires_in: 3600,
  token_type: 'Bearer'
};

/**
 * Sets up standard test environment for AuthService tests
 * - Sets AIC_BASE_URL to test value
 * - Handles environment variable cleanup
 * - Returns accessor for environment state
 *
 * @returns Object with getter functions for test environment state
 *
 * @example
 * ```typescript
 * describe('AuthService', () => {
 *   const { getBaseUrl } = setupAuthServiceTest();
 *
 *   it('should use configured base URL', () => {
 *     expect(getBaseUrl()).toBe('test.forgeblocks.com');
 *   });
 * });
 * ```
 */
export function setupAuthServiceTest() {
  let originalAicBaseUrl: string | undefined;
  let originalDockerContainer: string | undefined;

  beforeEach(() => {
    // Store original environment variables
    originalAicBaseUrl = process.env.AIC_BASE_URL;
    originalDockerContainer = process.env.DOCKER_CONTAINER;

    // Set test environment variables
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
    // Don't set DOCKER_CONTAINER by default - let tests control it
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalAicBaseUrl !== undefined) {
      process.env.AIC_BASE_URL = originalAicBaseUrl;
    } else {
      delete process.env.AIC_BASE_URL;
    }

    if (originalDockerContainer !== undefined) {
      process.env.DOCKER_CONTAINER = originalDockerContainer;
    } else {
      delete process.env.DOCKER_CONTAINER;
    }
  });

  // Return getter functions for accessing test state
  return {
    getBaseUrl: () => process.env.AIC_BASE_URL,
    getDockerContainer: () => process.env.DOCKER_CONTAINER
  };
}
