import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Track which storage constructor was called and with what arguments
let fileStorageCalls: string[] = [];
let keychainStorageCalls: Array<{ service: string; account: string }> = [];

// Use vi.hoisted() to ensure mocks are created before imports
const { MockFileStorage, MockKeychainStorage } = vi.hoisted(() => {
  // Mock FileStorage - tracks when it's instantiated and with what path
  class MockFileStorage {
    constructor(filePath: string = '/app/tokens/token.json') {
      fileStorageCalls.push(filePath);
    }
    async getToken() {
      return null;
    }
    async setToken() {}
    async deleteToken() {}
  }

  // Mock KeychainStorage - tracks when it's instantiated
  class MockKeychainStorage {
    constructor(service = 'PingOneAIC_MCP_Server', account = 'user-token') {
      keychainStorageCalls.push({ service, account });
    }
    async getToken() {
      return null;
    }
    async setToken() {}
    async deleteToken() {}
  }

  return { MockFileStorage, MockKeychainStorage };
});

// Mock tokenStorage module to intercept storage constructor calls
vi.mock('../../../src/services/tokenStorage.js', () => ({
  FileStorage: MockFileStorage,
  KeychainStorage: MockKeychainStorage
}));

// Mock 'open' to prevent browser launching during tests
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined)
}));

/**
 * Tests for AuthService mode detection using initAuthService/getAuthService
 *
 * The constructor decides between two authentication modes based on DOCKER_CONTAINER:
 * - Container mode (DOCKER_CONTAINER='true'): Uses Device Code flow + FileStorage
 * - Local mode (any other value or unset): Uses PKCE flow + KeychainStorage
 */
describe('AuthService Mode Detection', () => {
  let originalDockerContainer: string | undefined;

  beforeEach(async () => {
    // Store original DOCKER_CONTAINER value
    originalDockerContainer = process.env.DOCKER_CONTAINER;

    // Clear tracking arrays
    fileStorageCalls = [];
    keychainStorageCalls = [];

    // Reset modules - critical because authService constructor reads DOCKER_CONTAINER at instantiation
    vi.resetModules();

    // Set AIC_BASE_URL (required by authService)
    process.env.AIC_BASE_URL = 'test.forgeblocks.com';
  });

  afterEach(() => {
    // Restore original DOCKER_CONTAINER value
    if (originalDockerContainer !== undefined) {
      process.env.DOCKER_CONTAINER = originalDockerContainer;
    } else {
      delete process.env.DOCKER_CONTAINER;
    }
  });

  describe('Container Mode (DOCKER_CONTAINER=true)', () => {
    it('should create FileStorage when initAuthService is called', async () => {
      process.env.DOCKER_CONTAINER = 'true';

      const { initAuthService } = await import('../../../src/services/authService.js');
      initAuthService([], {});

      // FileStorage used → Device Code flow
      expect(fileStorageCalls).toHaveLength(1);
      expect(keychainStorageCalls).toHaveLength(0);
    });

    it('should create FileStorage with path /app/tokens/token.json', async () => {
      process.env.DOCKER_CONTAINER = 'true';

      const { initAuthService } = await import('../../../src/services/authService.js');
      initAuthService([], {});

      expect(fileStorageCalls).toEqual(['/app/tokens/token.json']);
    });
  });

  describe('Local Mode (DOCKER_CONTAINER=false)', () => {
    it('should create KeychainStorage when initAuthService is called', async () => {
      process.env.DOCKER_CONTAINER = 'false';

      const { initAuthService } = await import('../../../src/services/authService.js');
      initAuthService([], {});

      // KeychainStorage used → PKCE flow
      expect(keychainStorageCalls).toHaveLength(1);
      expect(fileStorageCalls).toHaveLength(0);
    });

    it('should create KeychainStorage with default service/account', async () => {
      process.env.DOCKER_CONTAINER = 'false';

      const { initAuthService } = await import('../../../src/services/authService.js');
      initAuthService([], {});

      expect(keychainStorageCalls).toEqual([
        {
          service: 'PingOneAIC_MCP_Server',
          account: 'user-token'
        }
      ]);
    });
  });

  describe('Local Mode (DOCKER_CONTAINER unset)', () => {
    it('should default to KeychainStorage when initAuthService is called', async () => {
      delete process.env.DOCKER_CONTAINER;

      const { initAuthService } = await import('../../../src/services/authService.js');
      initAuthService([], {});

      // KeychainStorage used → PKCE flow
      expect(keychainStorageCalls).toHaveLength(1);
      expect(fileStorageCalls).toHaveLength(0);
    });

    it('should create KeychainStorage with default service/account', async () => {
      delete process.env.DOCKER_CONTAINER;

      const { initAuthService } = await import('../../../src/services/authService.js');
      initAuthService([], {});

      expect(keychainStorageCalls).toEqual([
        {
          service: 'PingOneAIC_MCP_Server',
          account: 'user-token'
        }
      ]);
    });
  });
});
