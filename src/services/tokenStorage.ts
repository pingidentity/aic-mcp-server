// src/services/tokenStorage.ts
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Token data structure stored in keychain or file
 */
export interface TokenData {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  aicBaseUrl: string; // The AIC tenant this token was obtained for
}

/**
 * Interface for token storage implementations
 */
export interface TokenStorage {
  /**
   * Retrieve stored token data
   * @returns Token data if available and valid, null otherwise
   */
  getToken(): Promise<TokenData | null>;

  /**
   * Store token data
   * @param data - Token data to store
   */
  setToken(data: TokenData): Promise<void>;

  /**
   * Delete stored token data
   */
  deleteToken(): Promise<void>;
}

/**
 * Keychain-based token storage for local environments
 * Uses the OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
 */
export class KeychainStorage implements TokenStorage {
  private readonly service: string;
  private readonly account: string;

  constructor(service = 'PingOneAIC_MCP_Server', account = 'user-token') {
    this.service = service;
    this.account = account;
  }

  async getToken(): Promise<TokenData | null> {
    try {
      const keytar = (await import('keytar')).default;
      const storedTokenData = await keytar.getPassword(this.service, this.account);
      if (!storedTokenData) {
        return null;
      }
      return JSON.parse(storedTokenData) as TokenData;
    } catch (error) {
      console.error('Error reading token from keychain:', error);
      return null;
    }
  }

  async setToken(data: TokenData): Promise<void> {
    try {
      const keytar = (await import('keytar')).default;
      await keytar.setPassword(this.service, this.account, JSON.stringify(data));
    } catch (error) {
      console.error('Error storing token in keychain:', error);
      throw error;
    }
  }

  async deleteToken(): Promise<void> {
    try {
      const keytar = (await import('keytar')).default;
      await keytar.deletePassword(this.service, this.account);
    } catch (error) {
      console.error('Error deleting token from keychain:', error);
      throw error;
    }
  }
}

/**
 * File-based token storage for containerized environments
 * Stores tokens as JSON files in the filesystem
 */
export class FileStorage implements TokenStorage {
  private readonly filePath: string;

  constructor(filePath = '/app/tokens/token.json') {
    this.filePath = filePath;
  }

  async getToken(): Promise<TokenData | null> {
    try {
      const fileContent = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(fileContent) as TokenData;
    } catch (error: any) {
      // If file doesn't exist, return null (not an error)
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error('Error reading token from file:', error);
      return null;
    }
  }

  async setToken(data: TokenData): Promise<void> {
    try {
      // Create parent directories if they don't exist
      const directory = path.dirname(this.filePath);
      await fs.mkdir(directory, { recursive: true });

      // Write JSON with pretty formatting
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error storing token in file:', error);
      throw error;
    }
  }

  async deleteToken(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch (error: any) {
      // If file doesn't exist, consider it already deleted
      if (error.code === 'ENOENT') {
        return;
      }
      console.error('Error deleting token file:', error);
      throw error;
    }
  }
}
