// src/services/authService.ts
import * as http from 'http';
import * as crypto from 'crypto';
import open from 'open';
import keytar from 'keytar';

// --- Configuration ---
const AIC_BASE_URL = process.env.AIC_BASE_URL;

// Fixed OAuth configuration
const CLIENT_ID = 'AICMCPClient';
const EXCHANGE_CLIENT_ID = 'AICMCPExchangeClient';
const REDIRECT_URI_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_URI_PORT}`;
const AUTHORIZE_URL = `https://${AIC_BASE_URL}/am/oauth2/authorize`;
const TOKEN_URL = `https://${AIC_BASE_URL}/am/oauth2/access_token`;

// Keychain configuration
const KEYCHAIN_SERVICE = 'PingOneAIC_MCP_Server';
const KEYCHAIN_ACCOUNT = 'user-token';

/**
 * Token data stored in keychain
 */
interface TokenData {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  aicBaseUrl: string; // The AIC tenant this token was obtained for
}

/**
 * Authentication service using OAuth 2.0 PKCE flow
 * Handles user authentication and token management
 */
class AuthService {
  private tokenPromise: Promise<string> | null = null;
  private redirectServer: http.Server | null = null;
  private allScopes: string[];
  private hasAuthenticatedThisSession: boolean = false;

  constructor(allScopes: string[]) {
    this.allScopes = allScopes;
    console.error('Using user PKCE authentication');
  }

  /**
   * Get the primary access token with all scopes
   * Retrieves from keychain if available and valid, otherwise performs PKCE authentication
   * Always requires fresh authentication on first request of the session
   * @returns Primary access token with all scopes
   */
  private async getPrimaryToken(): Promise<string> {
    // Always skip keychain check on first request to require fresh authentication
    const shouldSkipCache = !this.hasAuthenticatedThisSession;

    if (!shouldSkipCache) {
      // Try to get token from keychain
      try {
        const storedTokenData = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
        if (storedTokenData) {
          const { accessToken, expiresAt, aicBaseUrl }: TokenData = JSON.parse(storedTokenData);

          // Check if token is for the current tenant
          if (aicBaseUrl !== AIC_BASE_URL) {
            console.error(`Cached token is for different tenant (${aicBaseUrl}), current tenant is ${AIC_BASE_URL}. Re-authenticating...`);
            // Token is for different tenant, proceed to get new token
          }
          // Check if token is still valid (and for correct tenant)
          else if (Date.now() < expiresAt) {
            return accessToken;
          }
        }
      } catch (error) {
        console.error('Error accessing keychain:', error);
      }
    } else {
      console.error('Fresh authentication required on startup');
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
   * Exchange the primary token for a scoped-down token via RFC 8693 token exchange
   * @param primaryToken - The broad-scope access token
   * @param requestedScopes - Specific scopes needed for this operation
   * @returns Scoped access token
   */
  private async exchangeToken(
    primaryToken: string,
    requestedScopes: string[]
  ): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
    params.append('subject_token', primaryToken);
    params.append('subject_token_type', 'urn:ietf:params:oauth:token-type:access_token');
    params.append('requested_token_type', 'urn:ietf:params:oauth:token-type:access_token');
    params.append('scope', requestedScopes.join(' '));
    params.append('client_id', EXCHANGE_CLIENT_ID);

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `Token exchange failed (${response.status} ${response.statusText}): ${errorText}`;

      // For 401, throw a specific error that we can catch and retry with re-auth
      if (response.status === 401) {
        const error = new Error(errorMessage);
        (error as any).shouldRetryWithReauth = true;
        throw error;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.access_token;
  }

  /**
   * Get a valid access token scoped to specific permissions via token exchange
   * @param scopes - OAuth scopes required for this operation
   * @returns Access token scoped to the requested permissions
   */
  async getToken(scopes?: string[]): Promise<string> {
    if (!scopes || scopes.length === 0) {
      throw new Error('Scopes parameter is required for token exchange');
    }

    console.error(`Token exchange: requesting scopes [${scopes.join(', ')}]`);

    try {
      // Get primary token (may trigger PKCE flow)
      const primaryToken = await this.getPrimaryToken();

      // Exchange for scoped-down token
      const exchangedToken = await this.exchangeToken(primaryToken, scopes);

      console.error(`Token exchange successful for scopes: [${scopes.join(', ')}]`);

      return exchangedToken;
    } catch (error: any) {
      // If token exchange failed due to expired/invalid token, retry with fresh auth
      if (error.shouldRetryWithReauth) {
        console.error('Primary token invalid, re-authenticating and retrying token exchange...');

        // Force fresh authentication
        this.hasAuthenticatedThisSession = false;

        // Get fresh primary token (will trigger PKCE flow)
        const freshPrimaryToken = await this.getPrimaryToken();

        // Retry exchange with fresh token
        const exchangedToken = await this.exchangeToken(freshPrimaryToken, scopes);

        console.error(`Token exchange successful after re-authentication for scopes: [${scopes.join(', ')}]`);

        return exchangedToken;
      }

      // Re-throw other errors
      throw error;
    }
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

      // Store token in keychain with tenant information
      try {
        const tokenData: TokenData = {
          accessToken,
          expiresAt,
          aicBaseUrl: AIC_BASE_URL!
        };
        await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, JSON.stringify(tokenData));
      } catch (error) {
        console.error('Failed to store token in keychain:', error);
      }

      // Mark that we've authenticated this session
      this.hasAuthenticatedThisSession = true;

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
        authUrl.searchParams.append('client_id', CLIENT_ID);
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
    params.append('client_id', CLIENT_ID);

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Authorization code exchange failed (${response.status} ${response.statusText}): ${errorText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Closes the local redirect server
   */
  private closeRedirectServer() {
    if (this.redirectServer) {
      this.redirectServer.close();
      this.redirectServer = null;
    }
  }
}

// Singleton instance
let instance: AuthService;

/**
 * Initialize the authentication service with required scopes
 * @param allScopes - All OAuth scopes needed by the application
 */
export function initAuthService(allScopes: string[]): void {
  instance = new AuthService(allScopes);
}

/**
 * Get the singleton authentication service instance
 * @returns The AuthService instance
 * @throws Error if service not initialized
 */
export function getAuthService(): AuthService {
  if (!instance) {
    throw new Error('AuthService not initialized. Call initAuthService first.');
  }
  return instance;
}
