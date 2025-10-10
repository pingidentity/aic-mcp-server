// src/services/authService.ts
import { UserAuthStrategy } from './auth/UserAuthStrategy.js';
import { ServiceAccountStrategy } from './auth/ServiceAccountStrategy.js';
import { AuthStrategy } from './auth/types.js';

/**
 * Main authentication service that coordinates between different auth strategies
 * Auto-detects which authentication method to use based on environment variables
 */
class AuthService {
  private strategy: AuthStrategy;
  private _isServiceAccount: boolean;

  constructor() {
    // Auto-detect authentication strategy based on environment variables
    const serviceAccountId = process.env.SERVICE_ACCOUNT_ID;
    const serviceAccountKey = process.env.SERVICE_ACCOUNT_PRIVATE_KEY;

    this._isServiceAccount = !!(serviceAccountId && serviceAccountKey);

    if (this._isServiceAccount) {
      // Use service account authentication if credentials are provided
      console.error('Using service account authentication');
      this.strategy = new ServiceAccountStrategy();
    } else {
      // Fall back to user PKCE authentication
      console.error('Using user PKCE authentication');
      this.strategy = new UserAuthStrategy();
    }
  }

  /**
   * Get a valid access token for the specified scopes
   * @param scopes - OAuth scopes required for the operation
   * @returns Access token string
   */
  async getToken(scopes: string[]): Promise<string> {
    return this.strategy.getToken(scopes);
  }

  /**
   * Check if using service account authentication
   * @returns true if using service account, false if using user PKCE
   */
  isServiceAccount(): boolean {
    return this._isServiceAccount;
  }
}

export const authService = new AuthService();
