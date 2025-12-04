import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FileStorage as FileStorageType } from '../../../src/services/tokenStorage.js';

// Use vi.hoisted() to ensure mocks are created before imports
const { mockReadFile, mockWriteFile, mockMkdir, mockChmod, mockUnlink } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockChmod: vi.fn(),
  mockUnlink: vi.fn(),
}));

// Mock node:fs/promises BEFORE other imports
vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  chmod: mockChmod,
  unlink: mockUnlink,
}));

import { createTestTokenData } from '../../helpers/authServiceTestHelper.js';


describe('FileStorage', () => {
  const DEFAULT_FILE_PATH = '/app/tokens/token.json';
  const CUSTOM_FILE_PATH = '/custom/path/token.json';

  let FileStorage: typeof FileStorageType;
  let consoleErrorSpy: any;

  beforeEach(async () => {
    // tokenStorage is imported in test/setup.ts via authService. Reset modules so we can
    // re-import it after our fs mock is in place and avoid using the real filesystem.
    vi.resetModules();
    ({ FileStorage } = await import('../../../src/services/tokenStorage.js'));

    // Clear all mock call history
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Token Serialization/Deserialization', () => {
    it('should serialize TokenData to JSON with pretty formatting', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);
      const tokenData = createTestTokenData();

      mockMkdir.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await storage.setToken(tokenData);

      expect(mockWriteFile).toHaveBeenCalledWith(
        DEFAULT_FILE_PATH,
        expect.stringContaining('"accessToken"'),
        {
          encoding: 'utf-8',
          mode: 0o600
        }
      );

      // Verify pretty formatting (should contain newlines and 2-space indentation)
      const writtenContent = mockWriteFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('\n');
      expect(writtenContent).toMatch(/\s{2}/); // 2-space indentation

      // Verify it's valid JSON that matches the token data
      const parsed = JSON.parse(writtenContent);
      expect(parsed).toEqual(tokenData);
    });

    it('should write JSON to file path', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);
      const tokenData = createTestTokenData();

      mockMkdir.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await storage.setToken(tokenData);

      expect(mockWriteFile).toHaveBeenCalledWith(
        DEFAULT_FILE_PATH,
        expect.any(String),
        {
          encoding: 'utf-8',
          mode: 0o600
        }
      );
    });

    it('should deserialize JSON from file', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);
      const tokenData = createTestTokenData();

      const fileContent = JSON.stringify(tokenData, null, 2);
      mockReadFile.mockResolvedValue(fileContent);

      const retrieved = await storage.getToken();

      expect(retrieved).toEqual(tokenData);
      expect(mockReadFile).toHaveBeenCalledWith(DEFAULT_FILE_PATH, 'utf-8');
    });

    it('should return TokenData object with all fields', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);
      const tokenData = createTestTokenData({
        accessToken: 'test-token-12345',
        expiresAt: 1234567890,
        aicBaseUrl: 'example.forgeblocks.com',
      });

      const fileContent = JSON.stringify(tokenData, null, 2);
      mockReadFile.mockResolvedValue(fileContent);

      const retrieved = await storage.getToken();

      expect(retrieved).toEqual({
        accessToken: 'test-token-12345',
        expiresAt: 1234567890,
        aicBaseUrl: 'example.forgeblocks.com',
      });
    });
  });

  describe('Directory Management', () => {
    it('should create parent directories with recursive: true', async () => {
      const storage = new FileStorage('/deeply/nested/path/token.json');
      const tokenData = createTestTokenData();

      mockMkdir.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await storage.setToken(tokenData);

      expect(mockMkdir).toHaveBeenCalledWith('/deeply/nested/path', {
        recursive: true,
        mode: 0o700
      });
    });

    it('should handle existing directories without error', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);
      const tokenData = createTestTokenData();

      mockMkdir.mockResolvedValue(undefined); // Directory already exists
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await expect(storage.setToken(tokenData)).resolves.toBeUndefined();
      expect(mockMkdir).toHaveBeenCalledWith('/app/tokens', {
        recursive: true,
        mode: 0o700
      });
    });

    it('should extract directory path correctly for nested paths', async () => {
      const storage = new FileStorage('/a/b/c/d/e/f/token.json');
      const tokenData = createTestTokenData();

      mockMkdir.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await storage.setToken(tokenData);

      expect(mockMkdir).toHaveBeenCalledWith('/a/b/c/d/e/f', {
        recursive: true,
        mode: 0o700
      });
    });
  });

  describe('File Operations', () => {
    it('should return null when file does not exist (ENOENT)', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);

      const enoentError: any = new Error('ENOENT: no such file or directory');
      enoentError.code = 'ENOENT';
      mockReadFile.mockRejectedValue(enoentError);

      const result = await storage.getToken();

      expect(result).toBeNull();
      expect(mockReadFile).toHaveBeenCalledWith(DEFAULT_FILE_PATH, 'utf-8');
    });

    it('should not throw on ENOENT (file not found)', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);

      const enoentError: any = new Error('ENOENT: no such file or directory');
      enoentError.code = 'ENOENT';
      mockReadFile.mockRejectedValue(enoentError);

      await expect(storage.getToken()).resolves.toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle read errors gracefully', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);

      // Return invalid JSON
      mockReadFile.mockResolvedValue('invalid json {');

      const result = await storage.getToken();

      expect(result).toBeNull();
    });

    it('should log errors on read failure', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);

      // Return invalid JSON to cause JSON.parse to throw
      mockReadFile.mockResolvedValue('invalid json {');

      await storage.getToken();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error reading token from file:',
        expect.any(Error)
      );
    });

    it('should handle ENOENT as success in deleteToken (already deleted)', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);

      const enoentError: any = new Error('ENOENT: no such file or directory');
      enoentError.code = 'ENOENT';
      mockUnlink.mockRejectedValue(enoentError);

      await expect(storage.deleteToken()).resolves.toBeUndefined();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle delete errors gracefully for non-ENOENT errors', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);

      const permissionError: any = new Error('EACCES: permission denied');
      permissionError.code = 'EACCES';
      mockUnlink.mockRejectedValue(permissionError);

      await expect(storage.deleteToken()).rejects.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error deleting token file:',
        expect.any(Error)
      );
    });
  });

  describe('JSON Formatting', () => {
    it('should format JSON with 2-space indentation', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);
      const tokenData = createTestTokenData();

      mockMkdir.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await storage.setToken(tokenData);

      const writtenContent = mockWriteFile.mock.calls[0][1] as string;

      // Check for 2-space indentation
      expect(writtenContent).toContain('  "accessToken"');
      expect(writtenContent).toContain('  "expiresAt"');
      expect(writtenContent).toContain('  "aicBaseUrl"');
    });

    it('should write UTF-8 encoded file', async () => {
      const storage = new FileStorage(DEFAULT_FILE_PATH);
      const tokenData = createTestTokenData({
        accessToken: 'token-with-unicode-©-symbol',
      });

      mockMkdir.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await storage.setToken(tokenData);

      expect(mockWriteFile).toHaveBeenCalledWith(
        DEFAULT_FILE_PATH,
        expect.stringContaining('token-with-unicode-©-symbol'),
        {
          encoding: 'utf-8',
          mode: 0o600
        }
      );
    });
  });

  describe('Interface Contract', () => {
    it('should use default path /app/tokens/token.json', async () => {
      const storage = new FileStorage();
      const tokenData = createTestTokenData();

      mockMkdir.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await storage.setToken(tokenData);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/app/tokens/token.json',
        expect.any(String),
        {
          encoding: 'utf-8',
          mode: 0o600
        }
      );
    });

    it('should accept custom file path', async () => {
      const storage = new FileStorage(CUSTOM_FILE_PATH);
      const tokenData = createTestTokenData();

      mockMkdir.mockResolvedValue(undefined);
      mockChmod.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      await storage.setToken(tokenData);

      expect(mockWriteFile).toHaveBeenCalledWith(
        CUSTOM_FILE_PATH,
        expect.any(String),
        {
          encoding: 'utf-8',
          mode: 0o600
        }
      );
    });
  });
});
