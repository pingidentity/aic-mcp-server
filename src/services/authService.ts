// src/services/authService.ts
import * as http from 'http';
import * as crypto from 'crypto';
import open from 'open';
import { TokenStorage, TokenData, KeychainStorage, FileStorage } from './tokenStorage.js';

/**
 * Response from device code authorization request (RFC 8628)
 */
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

/**
 * Response from device code token request
 */
interface DeviceCodeTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// --- Configuration ---
const AIC_BASE_URL = process.env.AIC_BASE_URL;

// Fixed OAuth configuration
const CLIENT_ID = 'AICMCPClient';
const EXCHANGE_CLIENT_ID = 'AICMCPExchangeClient';
const REDIRECT_URI_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_URI_PORT}`;
const AUTHORIZE_URL = `https://${AIC_BASE_URL}/am/oauth2/authorize`;
const TOKEN_URL = `https://${AIC_BASE_URL}/am/oauth2/access_token`;

/**
 * Configuration for AuthService behavior
 */
export interface AuthServiceConfig {
  allowCachedOnFirstRequest?: boolean;
  mcpServer?: any;  // MCP server instance for device code flow elicitation
}

/**
 * Authentication service supporting OAuth 2.0 PKCE and Device Code flows
 * Handles user authentication and token management with automatic mode selection
 */
class AuthService {
  private tokenPromise: Promise<string> | null = null;
  private redirectServer: http.Server | null = null;
  private allScopes: string[];
  private hasAuthenticatedThisSession: boolean = false;
  private config: AuthServiceConfig;
  private useDeviceCode: boolean;
  private storage: TokenStorage;
  private mcpServer?: any;
  private deviceCodeVerifier?: string; // PKCE verifier for device code flow

  constructor(allScopes: string[], config: AuthServiceConfig = {}) {
    this.allScopes = allScopes;
    this.config = config;
    this.mcpServer = config.mcpServer;

    // Docker build sets DOCKER_CONTAINER=true
    const inDocker = process.env.DOCKER_CONTAINER === 'true';

    this.useDeviceCode = inDocker;

    this.storage = inDocker
      ? new FileStorage('/app/tokens/token.json')
      : new KeychainStorage();
  }

  /**
   * Get the primary access token with all scopes
   * Retrieves from storage if available and valid, otherwise performs authentication
   * Always requires fresh authentication on first request of the session
   * @returns Primary access token with all scopes
   */
  private async getPrimaryToken(): Promise<string> {
    const shouldSkipCache = !this.hasAuthenticatedThisSession
      && !this.config.allowCachedOnFirstRequest;

    if (!shouldSkipCache) {
      // Try to get token from storage
      try {
        const tokenData = await this.storage.getToken();
        if (tokenData) {
          const { accessToken, expiresAt, aicBaseUrl } = tokenData;

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
        console.error('Error accessing token storage:', error);
      }
    } else {
      console.error('Fresh authentication required on startup');
    }

    // If token request is already in flight, return existing promise
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Determine which auth flow to use
    if (this.useDeviceCode) {
      this.tokenPromise = this.executeDeviceFlow(this.allScopes);
    } else {
      this.tokenPromise = this.executePkceFlow(this.allScopes);
    }

    try {
      return await this.tokenPromise;
    } finally {
      // Clear promise after awaiting so all concurrent waiters receive the result
      this.tokenPromise = null;
    }
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
    } catch (error: unknown) {
      // If token exchange failed due to expired/invalid token, retry with fresh auth
      if (error && typeof error === 'object' && 'shouldRetryWithReauth' in error && error.shouldRetryWithReauth) {
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

      // Store token in storage with tenant information
      try {
        const tokenData: TokenData = {
          accessToken,
          expiresAt,
          aicBaseUrl: AIC_BASE_URL!
        };
        await this.storage.setToken(tokenData);
      } catch (error) {
        console.error('Failed to store token in storage:', error);
      }

      // Mark that we've authenticated this session
      this.hasAuthenticatedThisSession = true;

      return accessToken;
    } catch (error) {
      console.error('User authentication failed:', error);
      throw error;
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
   * Request a device code from PingOne AIC with PKCE
   * @param scopes - OAuth scopes to request
   * @returns Device code response with verification URL
   */
  private async requestDeviceCode(scopes: string[]): Promise<DeviceCodeResponse> {
    // Generate PKCE challenge for device code flow
    const { verifier, challenge } = this.generatePkceChallenge();

    // Store verifier for later use in token polling
    this.deviceCodeVerifier = verifier;

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      scope: scopes.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    const response = await fetch(`https://${AIC_BASE_URL}/am/oauth2/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Device code request failed (${response.status} ${response.statusText}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Poll the token endpoint until user completes authentication
   * @param deviceCode - Device code to poll for
   * @param interval - Polling interval in seconds
   * @param expiresIn - How long until device code expires
   * @returns Access token response
   */
  private async pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number
  ): Promise<DeviceCodeTokenResponse> {
    const startTime = Date.now();
    const timeout = expiresIn * 1000;

    console.error('Waiting for user authentication...');

    while (Date.now() - startTime < timeout) {
      // Wait for the specified interval
      await new Promise(resolve => setTimeout(resolve, interval * 1000));

      // Attempt to get the token with PKCE verifier
      const params = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: CLIENT_ID,
        code_verifier: this.deviceCodeVerifier!
      });

      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      if (response.ok) {
        return response.json();
      }

      // Check error response
      const errorData = await response.json();

      // authorization_pending means user hasn't completed auth yet - keep polling
      if (errorData.error === 'authorization_pending') {
        continue;
      }

      // Any other error is fatal
      throw new Error(`Device code polling failed: ${errorData.error} - ${errorData.error_description || ''}`);
    }

    throw new Error('Device code expired - authentication timed out');
  }

  /**
   * Execute the complete OAuth Device Code Flow with MCP form elicitation
   * Presents authentication URL to user and waits for confirmation before polling
   * NOTE: once MCP client adoption of URL elicitation is widespread, we will switch to that method
   * NOTE: few clients support any MCP elicitation currently, so this and dockerisation are experimental features
   * @param scopes - OAuth scopes to request
   * @returns Primary access token
   */
  private async executeDeviceFlow(scopes: string[]): Promise<string> {
    if (!this.mcpServer) {
      throw new Error('MCP server reference required for device code flow. Pass mcpServer in AuthServiceConfig.');
    }

    try {
      // 1. Request device code from PingOne AIC
      const deviceData = await this.requestDeviceCode(scopes);

      // 2. Trigger MCP form elicitation with authentication URL
      const { randomUUID } = await import('crypto');
      const elicitationId = randomUUID();

      console.error('Requesting user authentication via device code flow...');

      const result = await this.mcpServer.server.elicitInput({
        mode: 'form',
        message: `Please authenticate with PingOne AIC by opening this URL in your browser:\n\n${deviceData.verification_uri_complete}\n\nPlease respond after you complete authentication.`,
        requestedSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        elicitationId: elicitationId
      });

      // 3. Check if user confirmed authentication by accepting the form
      if (result.action !== 'accept') {
        console.error('User cancelled authentication. Action:', result.action);
        throw new Error(`User cancelled authentication (action: ${result.action})`);
      }

      // 4. User accepted - poll for token
      console.error('User accepted authentication prompt, polling for token...');
      let tokenData: DeviceCodeTokenResponse;
      try {
        tokenData = await this.pollForToken(
          deviceData.device_code,
          deviceData.interval,
          deviceData.expires_in
        );
        console.error('Polling completed successfully');
      } catch (pollError: unknown) {
        const errorMessage = pollError instanceof Error ? pollError.message : String(pollError);
        console.error('Polling failed:', errorMessage);
        throw new Error(
          `Polling failed after user confirmed authentication. ` +
          `Error: ${errorMessage}. ` +
          `This suggests the user may not have completed authentication at PingOne AIC before confirming.`
        );
      }

      // 5. Store token using storage abstraction
      const tokenToStore: TokenData = {
        accessToken: tokenData.access_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        aicBaseUrl: AIC_BASE_URL!
      };

      await this.storage.setToken(tokenToStore);
      this.hasAuthenticatedThisSession = true;

      // 6. Send completion notification (optional per spec)
      try {
        await this.mcpServer.server.notification({
          method: 'notifications/elicitation/complete',
          params: { elicitationId }
        });
      } catch (error) {
        // Notification is optional, don't fail if it doesn't work
        console.error('Failed to send elicitation completion notification:', error);
      }

      console.error('✅ Device code authentication successful');
      return tokenData.access_token;

    } catch (error) {
      console.error('Device code authentication failed:', error);
      throw error;
    } finally {
      this.deviceCodeVerifier = undefined;
    }
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
 * @param config - Optional configuration for AuthService behavior
 */
export function initAuthService(
  allScopes: string[],
  config: AuthServiceConfig = {}
): void {
  instance = new AuthService(allScopes, config);
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
