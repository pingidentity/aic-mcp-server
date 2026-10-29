import * as http from 'http';
import * as crypto from 'crypto';
import open from 'open';
import { generatePkcePair } from './pkceUtils.js';
import { generateAuthResultPage } from './authResultPage.js';
import { USER_AGENT } from '../../utils/version.js';

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

interface PendingAuthFlow {
  resolve: (authCode: string) => void;
  reject: (error: Error) => void;
  aicBaseUrl: string;
  timeoutHandle: NodeJS.Timeout;
  onServerCreated?: (server: http.Server) => void;
  onServerClosed?: () => void;
}

const pendingAuthFlows = new Map<string, PendingAuthFlow>();
let redirectServer: http.Server | null = null;
let serverStartPromise: Promise<void> | null = null;

function writeAuthResponse(res: http.ServerResponse, statusCode: number, success: boolean, message?: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(generateAuthResultPage(success, message));
}

function finishAuthFlow(state: string, error?: Error, authCode?: string): void {
  const pending = pendingAuthFlows.get(state);
  if (!pending) {
    return;
  }

  pendingAuthFlows.delete(state);
  clearTimeout(pending.timeoutHandle);
  pending.onServerClosed?.();

  if (error) {
    pending.reject(error);
  } else if (authCode) {
    pending.resolve(authCode);
  }

  if (pendingAuthFlows.size === 0 && redirectServer) {
    redirectServer.close();
    redirectServer = null;
  }
}

function failAllAuthFlows(error: Error): void {
  [...pendingAuthFlows.keys()].forEach((state) => finishAuthFlow(state, error));
}

function findPendingState(receivedState: string): string | undefined {
  const receivedBuffer = Buffer.from(receivedState);
  return [...pendingAuthFlows.keys()].find((state) => {
    const stateBuffer = Buffer.from(state);
    return stateBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(stateBuffer, receivedBuffer);
  });
}

function createRedirectServer(redirectPort: number): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${redirectPort}`);
    const receivedState = url.searchParams.get('state');
    const authCode = url.searchParams.get('code');

    // A redirect without a matching state may be forged, so fail closed for every pending flow.
    if (!receivedState) {
      writeAuthResponse(res, 400, false, 'Missing state parameter');
      failAllAuthFlows(new Error('CSRF protection failed: state parameter missing'));
      return;
    }

    const matchedState = findPendingState(receivedState);
    const pending = matchedState ? pendingAuthFlows.get(matchedState) : undefined;
    if (!matchedState || !pending) {
      writeAuthResponse(res, 400, false, 'Invalid state parameter');
      failAllAuthFlows(new Error('CSRF protection failed: state mismatch'));
      return;
    }

    const refererRaw = req.headers['referer'] || req.headers['referrer'];
    const originRaw = req.headers['origin'];
    const headerValue =
      (Array.isArray(refererRaw) ? refererRaw[0] : refererRaw) || (Array.isArray(originRaw) ? originRaw[0] : originRaw);

    if (headerValue) {
      let parsedHostname: string;
      try {
        parsedHostname = new URL(headerValue).hostname.toLowerCase();
      } catch {
        writeAuthResponse(res, 403, false, 'Invalid request origin');
        finishAuthFlow(matchedState, new Error('Origin validation failed: invalid URL format'));
        return;
      }

      if (parsedHostname !== pending.aicBaseUrl.toLowerCase()) {
        writeAuthResponse(res, 403, false, 'Invalid request origin');
        finishAuthFlow(matchedState, new Error('Origin validation failed: hostname mismatch'));
        return;
      }
    }

    if (!authCode) {
      writeAuthResponse(res, 400, false, 'No authorization code received');
      finishAuthFlow(matchedState, new Error('Authorization code not found in redirect.'));
      return;
    }

    writeAuthResponse(res, 200, true);
    finishAuthFlow(matchedState, undefined, authCode);
  });
}

async function ensureRedirectServer(redirectPort: number): Promise<void> {
  if (redirectServer) {
    return;
  }

  if (!serverStartPromise) {
    serverStartPromise = new Promise<void>((resolve, reject) => {
      const server = createRedirectServer(redirectPort);
      redirectServer = server;

      server.on('error', (error) => {
        redirectServer = null;
        serverStartPromise = null;
        reject(error);
        failAllAuthFlows(error);
        server.close();
      });

      server.listen(redirectPort, () => {
        serverStartPromise = null;
        resolve();
      });
    });
  }

  await serverStartPromise;
}

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

  return ensureRedirectServer(redirectPort).then(
    () =>
      new Promise<string>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          console.error('Authentication timed out after 5 minutes');
          finishAuthFlow(state, new Error('Authentication timeout: User did not complete login within 5 minutes'));
        }, AUTH_TIMEOUT_MS);

        pendingAuthFlows.set(state, {
          resolve,
          reject,
          aicBaseUrl,
          timeoutHandle,
          onServerCreated: params.onServerCreated,
          onServerClosed: params.onServerClosed
        });
        params.onServerCreated?.(redirectServer!);

        const authUrl = new URL(authorizeUrl);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('scope', scopes.join(' '));
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('state', state);

        void open(authUrl.toString()).catch((error: unknown) => {
          finishAuthFlow(state, error instanceof Error ? error : new Error(String(error)));
        });
      })
  );
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
      'User-Agent': USER_AGENT
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Authorization code exchange failed (${response.status} ${response.statusText}): ${errorText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in
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
    onServerClosed: params.onServerClosed
  });

  return exchangeCodeForToken({
    tokenUrl: params.tokenUrl,
    code: authCode,
    codeVerifier: verifier,
    redirectUri: params.redirectUri,
    clientId: params.clientId
  });
}
