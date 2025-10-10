// src/services/auth/ServiceAccountStrategy.ts
import * as crypto from 'crypto';
import { SignJWT, importJWK, type KeyLike } from 'jose';
import keytar from 'keytar';
import { AuthStrategy, TokenData } from './types.js';

// --- Configuration ---
const AIC_BASE_URL = process.env.AIC_BASE_URL;
const SERVICE_ACCOUNT_ID = process.env.SERVICE_ACCOUNT_ID;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.SERVICE_ACCOUNT_PRIVATE_KEY;

const TOKEN_URL = `https://${AIC_BASE_URL}/am/oauth2/access_token`;
const AUDIENCE = TOKEN_URL;

// Keychain configuration for service account tokens
const KEYCHAIN_SERVICE = 'PingOneAIC_MCP_Server';

// Service account tokens expire after 15 minutes
const TOKEN_EXPIRY_SECONDS = 900; // 15 minutes

/**
 * Service account authentication strategy using JWT bearer grant
 * Uses cryptographic signing to obtain access tokens for machine-to-machine auth
 */
export class ServiceAccountStrategy implements AuthStrategy {
  private privateKey: KeyLike | undefined;
  private tokenPromises: Map<string, Promise<string>> = new Map();

  /**
   * Get a valid access token for the specified scopes
   * @param scopes - OAuth scopes required for the token
   */
  async getToken(scopes: string[]): Promise<string> {
    // Generate scope hash for keychain storage
    const scopeKey = this.getScopeKey(scopes);
    const keychainAccount = `sa-token-${scopeKey}`;

    // Try to get cached token from keychain
    try {
      const storedTokenData = await keytar.getPassword(KEYCHAIN_SERVICE, keychainAccount);
      if (storedTokenData) {
        const { accessToken, expiresAt }: TokenData = JSON.parse(storedTokenData);

        // Check if token is still valid (with 30 second buffer)
        if (Date.now() < expiresAt - 30000) {
          return accessToken;
        }
      }
    } catch (error) {
      console.error('Error accessing keychain:', error);
    }

    // Check if token request for these scopes is already in flight
    if (this.tokenPromises.has(scopeKey)) {
      return this.tokenPromises.get(scopeKey)!;
    }

    // Start new token acquisition
    const tokenPromise = this.acquireToken(scopes, keychainAccount);
    this.tokenPromises.set(scopeKey, tokenPromise);

    try {
      const token = await tokenPromise;
      return token;
    } finally {
      this.tokenPromises.delete(scopeKey);
    }
  }

  /**
   * Generates a consistent key for storing tokens based on scopes
   */
  private getScopeKey(scopes: string[]): string {
    const sortedScopes = scopes.slice().sort().join(',');
    return crypto.createHash('sha256').update(sortedScopes).digest('hex').substring(0, 16);
  }

  /**
   * Acquires a new access token using JWT bearer grant
   */
  private async acquireToken(scopes: string[], keychainAccount: string): Promise<string> {
    try {
      // Create and sign JWT assertion
      const assertion = await this.createSignedAssertion();

      // Exchange JWT for access token
      const { accessToken, expiresIn } = await this.exchangeJwtForToken(assertion, scopes);

      if (!accessToken) {
        throw new Error('Failed to obtain access token from service account JWT exchange.');
      }

      // Calculate expiry time
      const expiresAt = Date.now() + expiresIn * 1000;

      // Store token in keychain
      try {
        const tokenData: TokenData = { accessToken, expiresAt };
        await keytar.setPassword(KEYCHAIN_SERVICE, keychainAccount, JSON.stringify(tokenData));
      } catch (error) {
        console.error('Failed to store service account token in keychain:', error);
      }

      return accessToken;
    } catch (error) {
      console.error('Service account authentication failed:', error);
      throw error;
    }
  }

  /**
   * Creates and signs a JWT assertion for service account authentication
   */
  private async createSignedAssertion(): Promise<string> {
    if (!SERVICE_ACCOUNT_ID) {
      throw new Error('SERVICE_ACCOUNT_ID environment variable is not set');
    }
    if (!SERVICE_ACCOUNT_PRIVATE_KEY) {
      throw new Error('SERVICE_ACCOUNT_PRIVATE_KEY environment variable is not set');
    }

    // Import the private key if not already done
    if (!this.privateKey) {
      try {
        const jwk = JSON.parse(SERVICE_ACCOUNT_PRIVATE_KEY);
        const importedKey = await importJWK(jwk, 'RS256');
        // Type assertion because importJWK can return KeyLike | Uint8Array but JWK always returns KeyLike
        this.privateKey = importedKey as KeyLike;
      } catch (error) {
        throw new Error(`Failed to import service account JWK: ${error}`);
      }
    }

    // Ensure private key is loaded
    if (!this.privateKey) {
      throw new Error('Private key not loaded');
    }

    // Create JWT with required claims
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomBytes(16).toString('hex');

    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(SERVICE_ACCOUNT_ID)
      .setSubject(SERVICE_ACCOUNT_ID)
      .setAudience(AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + 900) // 15 minutes
      .setJti(jti)
      .sign(this.privateKey);

    return jwt;
  }

  /**
   * Exchanges the signed JWT for an access token
   */
  private async exchangeJwtForToken(
    assertion: string,
    scopes: string[]
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('assertion', assertion);
    params.append('client_id', 'service-account');
    params.append('scope', scopes.join(' '));

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange JWT for token: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || TOKEN_EXPIRY_SECONDS,
    };
  }
}
