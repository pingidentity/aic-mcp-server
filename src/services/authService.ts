// src/services/authService.ts
import * as http from 'http';
import * as crypto from 'crypto';
import open from 'open';
import keytar from 'keytar';

// --- Configuration ---

const AIC_BASE_URL = process.env.AIC_BASE_URL;

// Configurable OAuth client settings with defaults
const AIC_CLIENT_REALM = process.env.AIC_CLIENT_REALM || 'alpha';
const AIC_CLIENT_ID = process.env.AIC_CLIENT_ID || 'mcp';
const REDIRECT_URI_PORT = parseInt(process.env.REDIRECT_URI_PORT || '3000', 10);

// Construct the specific endpoint URLs based on configuration
const AUTHORIZE_URL = `https://${AIC_BASE_URL}/am/oauth2/${AIC_CLIENT_REALM}/authorize`;
const TOKEN_URL = `https://${AIC_BASE_URL}/am/oauth2/${AIC_CLIENT_REALM}/access_token`;

// The local redirect URI for OAuth PKCE flow
const REDIRECT_URI = `http://localhost:${REDIRECT_URI_PORT}`;

// Scopes are requested upfront to cover all potential tool operations.
const SCOPES = 'openid fr:idm:* fr:idc:monitoring:*';

// --- Keychain Configuration ---
const KEYCHAIN_SERVICE = 'PingOneAIC_MCP_Server';
const KEYCHAIN_ACCOUNT = 'accessToken';


class AuthService {
  private tokenPromise: Promise<string> | null = null;
  private redirectServer: http.Server | null = null;

  constructor() {}

  /**
   * Generates a secure code verifier and its corresponding S256 code challenge.
   */
  private generatePkceChallenge() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  /**
   * The main public method to get a token. It orchestrates the entire login flow.
   */
  public async getToken(): Promise<string> {
    // First, try to get the token from the keychain.
    try {
      const storedTokenData = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      if (storedTokenData) {
        const { accessToken, expiryTime } = JSON.parse(storedTokenData);
        
        // Check if the token is expired.
        if (Date.now() < expiryTime) {
          return accessToken;
        }
      }
    } catch (error) {
      console.error('Error accessing keychain:', error);
    }

    // If a token request is already in flight, return the existing promise.
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Start a new token acquisition process.
    this.tokenPromise = this.executePkceFlow();
    return this.tokenPromise;
  }

  /**
   * Executes the OAuth2 PKCE flow to obtain a new access token.
   */
  private async executePkceFlow(): Promise<string> {
    const { verifier, challenge } = this.generatePkceChallenge();

    try {
      const authCode = await this.startServerAndGetAuthCode(challenge);
      const { accessToken, expiresIn } = await this.exchangeCodeForToken(authCode, verifier);

      if (!accessToken) {
        throw new Error('Failed to obtain access token.');
      }
      
      // Calculate expiry time in milliseconds.
      const expiryTime = Date.now() + expiresIn * 1000;

      // Store the new token in the keychain.
      try {
        const tokenData = { accessToken, expiryTime };
        await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, JSON.stringify(tokenData));
      } catch (error) {
        console.error('Failed to store token in keychain:', error);
        // Decide if you want to throw here or just log the error.
        // For now, we'll just log it and continue.
      }
      
      return accessToken;
    } catch (error) {
      console.error('Authentication failed:', error);
      // Re-throw the error to be handled by the caller.
      throw error;
    } finally {
      this.tokenPromise = null; // Clear the promise on completion or failure.
    }
  }

  /**
   * Starts a local HTTP server to listen for the OAuth2 redirect and captures the authorization code.
   * Also opens the user's default browser to initiate the login.
   */
  private startServerAndGetAuthCode(challenge: string): Promise<string> {
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
        authUrl.searchParams.append('scope', SCOPES);
        authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.append('code_challenge', challenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');

        try{
          open(authUrl.toString());
        } catch (error) {
          reject(error)
        }
      });
    });
  }

  /**
   * Exchanges the authorization code for an access token.
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

  public closeRedirectServer() {
    if (this.redirectServer) {
      this.redirectServer.close();
      this.redirectServer = null;
    }
  }
}

export const authService = new AuthService();
