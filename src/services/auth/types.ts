/**
 * Authentication strategy interface
 * Implementations handle different authentication methods (user PKCE, service account, etc.)
 */
export interface AuthStrategy {
  /**
   * Get a valid access token, performing authentication if necessary
   * @param scopes - OAuth scopes required for the token
   * @returns Access token string
   */
  getToken(scopes: string[]): Promise<string>;
}

/**
 * Stored token metadata
 */
export interface TokenData {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}
