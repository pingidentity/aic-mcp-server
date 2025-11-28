import * as http from 'http';
import open from 'open';
import { generatePkcePair } from './pkceUtils.js';

export interface PkceFlowParams {
  scopes: string[];
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  redirectPort: number;
  onServerCreated?: (server: http.Server) => void;
  onServerClosed?: () => void;
}

export interface PkceFlowResult {
  accessToken: string;
  expiresIn: number;
}

function startServerAndGetAuthCode(params: {
  codeChallenge: string;
  scopes: string[];
  authorizeUrl: string;
  redirectUri: string;
  redirectPort: number;
  clientId: string;
  onServerCreated?: (server: http.Server) => void;
  onServerClosed?: () => void;
}): Promise<string> {
  const { codeChallenge, scopes, authorizeUrl, redirectUri, redirectPort, clientId } = params;

  return new Promise((resolve, reject) => {
    const redirectServer = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${redirectPort}`);
      const authCode = url.searchParams.get('code');

      if (authCode) {
        res.end('<h1>Success!</h1><p>You can close this browser tab.</p>');
        redirectServer.close();
        params.onServerClosed?.();
        resolve(authCode);
      } else {
        res.end('<h1>Error</h1><p>No authorization code found.</p>');
        redirectServer.close();
        params.onServerClosed?.();
        reject(new Error('Authorization code not found in redirect.'));
      }
    });

    params.onServerCreated?.(redirectServer);

    redirectServer.on('error', (err) => {
      redirectServer.close();
      params.onServerClosed?.();
      reject(err);
    });

    redirectServer.listen(redirectPort, () => {
      const authUrl = new URL(authorizeUrl);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('client_id', clientId);
      authUrl.searchParams.append('scope', scopes.join(' '));
      authUrl.searchParams.append('redirect_uri', redirectUri);
      authUrl.searchParams.append('code_challenge', codeChallenge);
      authUrl.searchParams.append('code_challenge_method', 'S256');

      try {
        void open(authUrl.toString());
      } catch (error) {
        redirectServer.close();
        params.onServerClosed?.();
        reject(error);
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
