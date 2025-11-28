// src/services/authService.ts
import type { Server as HttpServer } from 'http';
import { TokenStorage, TokenData, KeychainStorage, FileStorage } from './tokenStorage.js';
import { executePkceFlow as runPkceFlow } from './flows/pkceFlow.js';
import { executeDeviceFlow as runDeviceFlow } from './flows/deviceFlow.js';

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
  private redirectServer: HttpServer | null = null;
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
   * Executes the OAuth2 PKCE flow to obtain a new access token
   */
  private async executePkceFlow(scopes: string[]): Promise<string> {
    try {
      const { accessToken, expiresIn } = await runPkceFlow({
        scopes,
        authorizeUrl: AUTHORIZE_URL,
        tokenUrl: TOKEN_URL,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        redirectPort: REDIRECT_URI_PORT,
        onServerCreated: (server) => { this.redirectServer = server; },
        onServerClosed: () => { this.redirectServer = null; },
      });

      const expiresAt = Date.now() + expiresIn * 1000;

      try {
        const tokenData: TokenData = {
          accessToken,
          expiresAt,
          aicBaseUrl: AIC_BASE_URL!,
        };
        await this.storage.setToken(tokenData);
      } catch (error) {
        console.error('Failed to store token in storage:', error);
      }

      this.hasAuthenticatedThisSession = true;
      return accessToken;
    } catch (error) {
      console.error('User authentication failed:', error);
      throw error;
    }
  }

  /**
   * Execute the complete OAuth Device Code Flow with MCP form elicitation
   * @param scopes - OAuth scopes to request
   * @returns Primary access token
   */
  private async executeDeviceFlow(scopes: string[]): Promise<string> {
    if (!this.mcpServer) {
      throw new Error('MCP server reference required for device code flow. Pass mcpServer in AuthServiceConfig.');
    }

    const verifierState = {
      set: (value: string) => { this.deviceCodeVerifier = value; },
      get: () => this.deviceCodeVerifier,
      clear: () => { this.deviceCodeVerifier = undefined; },
    };

    const tokenData = await runDeviceFlow({
      scopes,
      clientId: CLIENT_ID,
      aicBaseUrl: AIC_BASE_URL!,
      tokenUrl: TOKEN_URL,
      storage: this.storage,
      mcpServer: this.mcpServer,
      verifierState,
    });

    this.hasAuthenticatedThisSession = true;
    return tokenData.access_token;
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
