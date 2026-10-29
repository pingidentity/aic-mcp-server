// src/services/authService.ts
import type { Server as HttpServer } from 'http';
import { TokenStorage, TokenData, KeychainStorage, FileStorage } from './tokenStorage.js';
import { executePkceFlow as runPkceFlow } from './flows/pkceFlow.js';
import { executeDeviceFlow as runDeviceFlow } from './flows/deviceFlow.js';
import { USER_AGENT } from '../utils/version.js';
import { EnvironmentConfig, getEnvironment, getEnvironmentNames } from './environmentContext.js';

// Fixed OAuth configuration
const CLIENT_ID = 'AICMCPClient';
const EXCHANGE_CLIENT_ID = 'AICMCPExchangeClient';
const REDIRECT_URI_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_URI_PORT}`;

/**
 * Clock skew tolerance in milliseconds
 * Tokens are considered expired this many milliseconds before actual expiry
 * to account for clock drift between client and server
 */
const CLOCK_SKEW_BUFFER_MS = 60 * 1000; // 60 seconds

/**
 * Configuration for AuthService behavior
 */
export interface AuthServiceConfig {
  allowCachedOnFirstRequest?: boolean;
  mcpServer?: any; // MCP server instance for device code flow elicitation
}

/**
 * Authentication service supporting OAuth 2.0 PKCE and Device Code flows
 * Handles user authentication and token management with automatic mode selection
 */
class AuthService {
  private readonly environment: EnvironmentConfig;
  private readonly authorizeUrl: string;
  private readonly tokenUrl: string;
  private tokenPromise: Promise<string> | null = null;
  private redirectServer: HttpServer | null = null;
  private allScopes: string[];
  private hasAuthenticatedThisSession: boolean = false;
  private config: AuthServiceConfig;
  private useDeviceCode: boolean;
  private storage: TokenStorage;
  private mcpServer?: any;
  private deviceCodeVerifier?: string; // PKCE verifier for device code flow

  constructor(environment: EnvironmentConfig, allScopes: string[], config: AuthServiceConfig = {}) {
    this.environment = environment;
    this.authorizeUrl = `https://${environment.baseUrl}/am/oauth2/authorize`;
    this.tokenUrl = `https://${environment.baseUrl}/am/oauth2/access_token`;
    this.allScopes = allScopes;
    this.config = config;
    this.mcpServer = config.mcpServer;

    // Docker build sets DOCKER_CONTAINER=true
    const inDocker = process.env.DOCKER_CONTAINER === 'true';

    this.useDeviceCode = inDocker;

    const tokenAccount = environment.name === 'default' ? 'user-token' : `user-token-${environment.name}`;
    this.storage = inDocker
      ? new FileStorage(
          environment.name === 'default' ? '/app/tokens/token.json' : `/app/tokens/${environment.name}.json`
        )
      : new KeychainStorage('PingOneAIC_MCP_Server', tokenAccount);
  }

  /**
   * Get the primary access token with all scopes
   * Retrieves from storage if available and valid, otherwise performs authentication
   * Always requires fresh authentication on first request of the session
   * @returns Primary access token with all scopes
   */
  private async getPrimaryToken(): Promise<string> {
    // If token request is already in flight, return existing promise
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Share the entire primary-token acquisition path, including storage lookup.
    // This prevents parallel tool requests from racing each other into duplicate
    // keychain reads or unexpected interactive authentication.
    this.tokenPromise = (async () => {
      const shouldSkipCache = !this.hasAuthenticatedThisSession && !this.config.allowCachedOnFirstRequest;

      if (!shouldSkipCache) {
        try {
          const tokenData = await this.storage.getToken();
          if (tokenData) {
            const { accessToken, expiresAt, aicBaseUrl } = tokenData;

            if (aicBaseUrl !== this.environment.baseUrl) {
              console.error(
                `Cached token is for different tenant (${aicBaseUrl}), current tenant is ${this.environment.baseUrl}. Re-authenticating...`
              );
            } else if (Date.now() + CLOCK_SKEW_BUFFER_MS < expiresAt) {
              return accessToken;
            }
          }
        } catch (error) {
          console.error('Error accessing token storage:', error);
        }
      } else {
        console.error('Fresh authentication required on startup');
      }

      return this.useDeviceCode ? this.executeDeviceFlow(this.allScopes) : this.executePkceFlow(this.allScopes);
    })();

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
  private async exchangeToken(primaryToken: string, requestedScopes: string[]): Promise<string> {
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
    params.append('subject_token', primaryToken);
    params.append('subject_token_type', 'urn:ietf:params:oauth:token-type:access_token');
    params.append('requested_token_type', 'urn:ietf:params:oauth:token-type:access_token');
    params.append('scope', requestedScopes.join(' '));
    params.append('client_id', EXCHANGE_CLIENT_ID);

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT
      },
      body: params
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

  async forceReauthentication(): Promise<void> {
    this.hasAuthenticatedThisSession = false;
    await this.storage.deleteToken();
  }

  /**
   * Executes the OAuth2 PKCE flow to obtain a new access token
   */
  private async executePkceFlow(scopes: string[]): Promise<string> {
    try {
      const { accessToken, expiresIn } = await runPkceFlow({
        scopes,
        authorizeUrl: this.authorizeUrl,
        tokenUrl: this.tokenUrl,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        redirectPort: REDIRECT_URI_PORT,
        aicBaseUrl: this.environment.baseUrl,
        onServerCreated: (server) => {
          this.redirectServer = server;
        },
        onServerClosed: () => {
          this.redirectServer = null;
        }
      });

      const expiresAt = Date.now() + expiresIn * 1000;

      try {
        const tokenData: TokenData = {
          accessToken,
          expiresAt,
          aicBaseUrl: this.environment.baseUrl
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
      set: (value: string) => {
        this.deviceCodeVerifier = value;
      },
      get: () => this.deviceCodeVerifier,
      clear: () => {
        this.deviceCodeVerifier = undefined;
      }
    };

    const tokenData = await runDeviceFlow({
      scopes,
      clientId: CLIENT_ID,
      aicBaseUrl: this.environment.baseUrl,
      tokenUrl: this.tokenUrl,
      storage: this.storage,
      mcpServer: this.mcpServer,
      verifierState
    });

    this.hasAuthenticatedThisSession = true;
    return tokenData.access_token;
  }

  /**
   * Cleanup resources (e.g., HTTP server for redirect)
   * Safe to call multiple times
   */
  cleanup(): void {
    if (this.redirectServer) {
      try {
        this.redirectServer.close();
      } catch (error) {
        console.error('Error closing redirect server:', error);
      }
      this.redirectServer = null;
    }
  }
}

let instances: Map<string, AuthService>;

/**
 * Initialize the authentication service with required scopes
 * @param allScopes - All OAuth scopes needed by the application
 * @param config - Optional configuration for AuthService behavior
 */
export function initAuthService(allScopes: string[], config: AuthServiceConfig = {}): void {
  instances = new Map(
    getEnvironmentNames().map((name) => {
      const environment = getEnvironment(name);
      return [name, new AuthService(environment, allScopes, config)];
    })
  );
}

/**
 * Get the singleton authentication service instance
 * @returns The AuthService instance
 * @throws Error if service not initialized
 */
export function getAuthService(environmentName?: string): AuthService {
  if (!instances) {
    throw new Error('AuthService not initialized. Call initAuthService first.');
  }

  const environment = getEnvironment(environmentName);
  const instance = instances.get(environment.name);
  if (!instance) {
    throw new Error(`AuthService not initialized for environment: ${environment.name}`);
  }

  return instance;
}

/**
 * Cleanup authentication service resources
 * Closes any running redirect server
 */
export function cleanupAuthService(): void {
  if (instances) {
    for (const instance of instances.values()) {
      instance.cleanup();
    }
  }
}
