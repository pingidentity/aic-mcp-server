import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeychainStorage, TokenData } from '../../../src/services/tokenStorage.js';
import { createTestTokenData } from '../../helpers/authServiceTestHelper.js';

// Mock keytar module with dynamic import support
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn(),
    getPassword: vi.fn(),
    deletePassword: vi.fn(),
  }
}));

describe('KeychainStorage', () => {
  let storage: KeychainStorage;
  let mockKeytar: any;

  beforeEach(async () => {
    // Reset storage instance
    storage = new KeychainStorage();

    // Import mocked keytar to access mock functions
    mockKeytar = (await import('keytar')).default;

    // Clear all mock call history
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===== TOKEN SERIALIZATION/DESERIALIZATION TESTS =====
  describe('Token Serialization/Deserialization', () => {
    it('should serialize TokenData to JSON string', async () => {
      const tokenData = createTestTokenData();

      await storage.setToken(tokenData);

      expect(mockKeytar.setPassword).toHaveBeenCalledWith(
        'PingOneAIC_MCP_Server',
        'user-token',
        JSON.stringify(tokenData)
      );
    });

    it('should call keytar.setPassword with correct service/account', async () => {
      const tokenData = createTestTokenData();

      await storage.setToken(tokenData);

      expect(mockKeytar.setPassword).toHaveBeenCalledWith(
        'PingOneAIC_MCP_Server',
        'user-token',
        expect.any(String)
      );
    });

    it('should deserialize JSON string to TokenData', async () => {
      const tokenData = createTestTokenData();
      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(tokenData));

      const result = await storage.getToken();

      expect(result).toEqual(tokenData);
    });

    it('should return null when keytar.getPassword returns null', async () => {
      mockKeytar.getPassword.mockResolvedValue(null);

      const result = await storage.getToken();

      expect(result).toBeNull();
    });

    it('should return TokenData object with all fields (accessToken, expiresAt, aicBaseUrl)', async () => {
      const tokenData: TokenData = {
        accessToken: 'test-token-abc123',
        expiresAt: 1234567890000,
        aicBaseUrl: 'test.forgeblocks.com',
      };
      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(tokenData));

      const result = await storage.getToken();

      expect(result).toHaveProperty('accessToken', 'test-token-abc123');
      expect(result).toHaveProperty('expiresAt', 1234567890000);
      expect(result).toHaveProperty('aicBaseUrl', 'test.forgeblocks.com');
    });
  });

  // ===== ERROR HANDLING TESTS =====
  describe('Error Handling', () => {
    it('should return null when keytar throws error', async () => {
      mockKeytar.getPassword.mockRejectedValue(new Error('Keychain access denied'));

      const result = await storage.getToken();

      expect(result).toBeNull();
    });

    it('should log error when keytar getPassword fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockKeytar.getPassword.mockRejectedValue(new Error('Keychain access denied'));

      await storage.getToken();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error reading token from keychain:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should throw error when keytar.setPassword fails', async () => {
      const tokenData = createTestTokenData();
      mockKeytar.setPassword.mockRejectedValue(new Error('Keychain write failed'));

      await expect(storage.setToken(tokenData)).rejects.toThrow('Keychain write failed');
    });

    it('should log error when keytar setPassword fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const tokenData = createTestTokenData();
      mockKeytar.setPassword.mockRejectedValue(new Error('Keychain write failed'));

      try {
        await storage.setToken(tokenData);
      } catch (error) {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error storing token in keychain:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle keytar.deletePassword errors gracefully', async () => {
      mockKeytar.deletePassword.mockRejectedValue(new Error('Keychain delete failed'));

      await expect(storage.deleteToken()).rejects.toThrow('Keychain delete failed');
    });
  });
});
