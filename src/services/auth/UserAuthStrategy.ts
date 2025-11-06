// src/services/auth/UserAuthStrategy.ts
import * as http from 'http';
import * as crypto from 'crypto';
import open from 'open';
import keytar from 'keytar';
import { AuthStrategy, TokenData } from './types.js';

// --- Configuration ---
const AIC_BASE_URL = process.env.AIC_BASE_URL;
const AIC_CLIENT_REALM = process.env.AIC_CLIENT_REALM || 'root';
const AIC_CLIENT_ID = process.env.AIC_CLIENT_ID || 'local-client';
const REDIRECT_URI_PORT = parseInt(process.env.REDIRECT_URI_PORT || '3000', 10);

// URL structure adapts based on realm:
// - root realm: /am/oauth2/{endpoint}
// - alpha/bravo realms: /am/oauth2/{realm}/{endpoint}
const AUTHORIZE_URL = AIC_CLIENT_REALM === 'root'
  ? `https://${AIC_BASE_URL}/am/oauth2/authorize`
  : `https://${AIC_BASE_URL}/am/oauth2/${AIC_CLIENT_REALM}/authorize`;
const TOKEN_URL = AIC_CLIENT_REALM === 'root'
  ? `https://${AIC_BASE_URL}/am/oauth2/access_token`
  : `https://${AIC_BASE_URL}/am/oauth2/${AIC_CLIENT_REALM}/access_token`;
const REDIRECT_URI = `http://localhost:${REDIRECT_URI_PORT}`;

// Keychain configuration for user tokens
const KEYCHAIN_SERVICE = 'PingOneAIC_MCP_Server';
const KEYCHAIN_ACCOUNT = 'user-token';

/**
 * User authentication strategy using OAuth 2.0 PKCE flow
 * Requests all scopes upfront (ignores scopes parameter in getToken)
 */
export class UserAuthStrategy implements AuthStrategy {
  private tokenPromise: Promise<string> | null = null;
  private redirectServer: http.Server | null = null;
  private allScopes: string[];

  constructor(allScopes: string[]) {
    this.allScopes = allScopes;
  }

  /**
   * Get a valid access token using PKCE flow
   * @param scopes - Ignored for user auth (all scopes requested upfront)
   */
  async getToken(scopes: string[]): Promise<string> {
    // Try to get token from keychain
    try {
      const storedTokenData = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      if (storedTokenData) {
        const { accessToken, expiresAt }: TokenData = JSON.parse(storedTokenData);

        // Check if token is still valid
        if (Date.now() < expiresAt) {
          return accessToken;
        }
      }
    } catch (error) {
      console.error('Error accessing keychain:', error);
    }

    // If token request is already in flight, return existing promise
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Start new token acquisition with all scopes
    this.tokenPromise = this.executePkceFlow(this.allScopes);
    return this.tokenPromise;
  }

  /**
   * Generates PKCE code verifier and challenge
   */
  private generatePkceChallenge() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  /**
   * Executes the OAuth2 PKCE flow to obtain a new access token
   */
  private async executePkceFlow(scopes: string[]): Promise<string> {
    const { verifier, challenge } = this.generatePkceChallenge();

    try {
      const authCode = await this.startServerAndGetAuthCode(challenge, scopes);
      const { accessToken, expiresIn } = await this.exchangeCodeForToken(authCode, verifier);

      if (!accessToken) {
        throw new Error('Failed to obtain access token.');
      }

      // Calculate expiry time
      const expiresAt = Date.now() + expiresIn * 1000;

      // Store token in keychain
      try {
        const tokenData: TokenData = { accessToken, expiresAt };
        await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, JSON.stringify(tokenData));
      } catch (error) {
        console.error('Failed to store token in keychain:', error);
      }

      return accessToken;
    } catch (error) {
      console.error('User authentication failed:', error);
      throw error;
    } finally {
      this.tokenPromise = null;
    }
  }

  /**
   * Starts local HTTP server to receive OAuth redirect and opens browser
   */
  private startServerAndGetAuthCode(challenge: string, scopes: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      this.redirectServer = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:${REDIRECT_URI_PORT}`);
        const authCode = url.searchParams.get('code');

        if (authCode) {
          res.end('<h1>Success!</h1><p>You can close this browser tab.</p>');
          this.closeRedirectServer();
          resolve(authCode);
        } else {
          res.end('<h1>Error</h1><p>No authorization code found.</p>');
          this.closeRedirectServer();
          reject(new Error('Authorization code not found in redirect.'));
        }
      });

      this.redirectServer.on('error', (err) => {
        this.closeRedirectServer();
        reject(err);
      });

      this.redirectServer.listen(REDIRECT_URI_PORT, () => {
        const authUrl = new URL(AUTHORIZE_URL);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', AIC_CLIENT_ID);
        authUrl.searchParams.append('scope', scopes.join(' '));
        authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.append('code_challenge', challenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');

        try {
          open(authUrl.toString());
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Exchanges authorization code for access token
   */
  private async exchangeCodeForToken(code: string, verifier: string): Promise<{ accessToken: string; expiresIn: number }> {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code_verifier', verifier);
    params.append('client_id', AIC_CLIENT_ID);

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for token: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  private closeRedirectServer() {
    if (this.redirectServer) {
      this.redirectServer.close();
      this.redirectServer = null;
    }
  }
}
