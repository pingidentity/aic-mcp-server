import * as http from 'http';
import * as crypto from 'crypto';
import open from 'open';
import { generatePkcePair } from './pkceUtils.js';

export interface PkceFlowParams {
  scopes: string[];
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  redirectPort: number;
  aicBaseUrl: string;
  onServerCreated?: (server: http.Server) => void;
  onServerClosed?: () => void;
}

export interface PkceFlowResult {
  accessToken: string;
  expiresIn: number;
}

// Authentication timeout in milliseconds (5 minutes)
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

function startServerAndGetAuthCode(params: {
  codeChallenge: string;
  scopes: string[];
  authorizeUrl: string;
  redirectUri: string;
  redirectPort: number;
  clientId: string;
  aicBaseUrl: string;
  onServerCreated?: (server: http.Server) => void;
  onServerClosed?: () => void;
}): Promise<string> {
  const { codeChallenge, scopes, authorizeUrl, redirectUri, redirectPort, clientId, aicBaseUrl } = params;

  // Generate state for CSRF protection
  const state = crypto.randomBytes(16).toString('base64url');

  return new Promise((resolve, reject) => {
    let timeoutHandle: NodeJS.Timeout | null = null;

    const cleanup = (error?: Error) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      redirectServer.close();
      params.onServerClosed?.();

      if (error) {
        reject(error);
      }
    };

    const redirectServer = http.createServer((req, res) => {
      // Origin validation (lenient approach - only validate if header present)
      const refererRaw = req.headers['referer'] || req.headers['referrer'];
      const originRaw = req.headers['origin'];

      // Convert to string (headers can be string | string[] | undefined)
      const referer = Array.isArray(refererRaw) ? refererRaw[0] : refererRaw;
      const origin = Array.isArray(originRaw) ? originRaw[0] : originRaw;

      if (referer || origin) {
        // At least one header present, validate it
        const headerValue = referer || origin || '';
        const expectedDomain = aicBaseUrl.toLowerCase();

        // Parse URL to extract hostname for exact matching
        let parsedHostname: string;
        try {
          const parsedUrl = new URL(headerValue);
          parsedHostname = parsedUrl.hostname.toLowerCase();
        } catch {
          console.error(`Invalid URL format in origin/referer header: ${headerValue}`);
          res.writeHead(403, { 'Content-Type': 'text/html' });
          res.end('<h1>Error</h1><p>Invalid request origin</p>');
          cleanup(new Error('Origin validation failed: invalid URL format'));
          return;
        }

        // Exact hostname match to prevent subdomain attacks
        if (parsedHostname !== expectedDomain) {
          console.error(`Rejected redirect from unexpected origin: ${parsedHostname}`);
          console.error(`Expected origin: ${expectedDomain}`);
          res.writeHead(403, { 'Content-Type': 'text/html' });
          res.end('<h1>Error</h1><p>Invalid request origin</p>');
          cleanup(new Error('Origin validation failed: hostname mismatch'));
          return;
        }
      }
      // If no headers present, allow (lenient for privacy-focused browsers)

      const url = new URL(req.url!, `http://localhost:${redirectPort}`);
      const receivedState = url.searchParams.get('state');
      const authCode = url.searchParams.get('code');

      // Validate state first (CSRF protection)
      if (!receivedState) {
        res.end('<h1>Error</h1><p>Missing state parameter</p>');
        cleanup(new Error('CSRF protection failed: state parameter missing'));
        return;
      }

      // Constant-time comparison to prevent timing attacks
      const stateBuffer = Buffer.from(state);
      const receivedBuffer = Buffer.from(receivedState);

      if (stateBuffer.length !== receivedBuffer.length ||
          !crypto.timingSafeEqual(stateBuffer, receivedBuffer)) {
        res.end('<h1>Error</h1><p>Invalid state parameter</p>');
        cleanup(new Error('CSRF protection failed: state mismatch'));
        return;
      }

      // Continue with existing authCode check
      if (authCode) {
        res.end('<h1>Success!</h1><p>You can close this browser tab.</p>');
        cleanup();
        resolve(authCode);
      } else {
        res.end('<h1>Error</h1><p>No authorization code found.</p>');
        cleanup(new Error('Authorization code not found in redirect.'));
      }
    });

    params.onServerCreated?.(redirectServer);

    redirectServer.on('error', (err) => {
      cleanup(err);
    });

    redirectServer.listen(redirectPort, () => {
      // Start timeout after server is listening
      timeoutHandle = setTimeout(() => {
        console.error('Authentication timed out after 5 minutes');
        cleanup(new Error('Authentication timeout: User did not complete login within 5 minutes'));
      }, AUTH_TIMEOUT_MS);

      const authUrl = new URL(authorizeUrl);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('client_id', clientId);
      authUrl.searchParams.append('scope', scopes.join(' '));
      authUrl.searchParams.append('redirect_uri', redirectUri);
      authUrl.searchParams.append('code_challenge', codeChallenge);
      authUrl.searchParams.append('code_challenge_method', 'S256');
      authUrl.searchParams.append('state', state);

      try {
        void open(authUrl.toString());
      } catch (error) {
        cleanup(error as Error);
      }
    });
  });
}

async function exchangeCodeForToken(params: {
  tokenUrl: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
}): Promise<PkceFlowResult> {
  const { tokenUrl, code, codeVerifier, redirectUri, clientId } = params;

  const body = new URLSearchParams();
  body.append('grant_type', 'authorization_code');
  body.append('code', code);
  body.append('redirect_uri', redirectUri);
  body.append('code_verifier', codeVerifier);
  body.append('client_id', clientId);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
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

export async function executePkceFlow(params: PkceFlowParams): Promise<PkceFlowResult> {
  const { verifier, challenge } = generatePkcePair();

  const authCode = await startServerAndGetAuthCode({
    codeChallenge: challenge,
    scopes: params.scopes,
    authorizeUrl: params.authorizeUrl,
    redirectUri: params.redirectUri,
    redirectPort: params.redirectPort,
    clientId: params.clientId,
    aicBaseUrl: params.aicBaseUrl,
    onServerCreated: params.onServerCreated,
    onServerClosed: params.onServerClosed,
  });

  return exchangeCodeForToken({
    tokenUrl: params.tokenUrl,
    code: authCode,
    codeVerifier: verifier,
    redirectUri: params.redirectUri,
    clientId: params.clientId,
  });
}
