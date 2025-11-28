import { TokenData, TokenStorage } from '../tokenStorage.js';
import { generatePkcePair } from './pkceUtils.js';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DeviceCodeTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface VerifierState {
  set: (value: string) => void;
  get: () => string | undefined;
  clear: () => void;
}

export interface DeviceFlowParams {
  scopes: string[];
  clientId: string;
  aicBaseUrl: string;
  tokenUrl: string;
  storage: TokenStorage;
  mcpServer: any;
  verifierState: VerifierState;
}

async function requestDeviceCode(params: {
  scopes: string[];
  clientId: string;
  deviceCodeUrl: string;
  verifierState: VerifierState;
}): Promise<DeviceCodeResponse> {
  const { verifier, challenge } = generatePkcePair();
  params.verifierState.set(verifier);

  const body = new URLSearchParams({
    client_id: params.clientId,
    scope: params.scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const response = await fetch(params.deviceCodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Device code request failed (${response.status} ${response.statusText}): ${errorText}`);
  }

  return response.json();
}

async function pollForToken(params: {
  deviceCode: string;
  interval: number;
  expiresIn: number;
  tokenUrl: string;
  clientId: string;
  verifierState: VerifierState;
}): Promise<DeviceCodeTokenResponse> {
  const startTime = Date.now();
  const timeout = params.expiresIn * 1000;

  console.error('Waiting for user authentication...');

  while (Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, params.interval * 1000));

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: params.deviceCode,
      client_id: params.clientId,
      code_verifier: params.verifierState.get()!,
    });

    const response = await fetch(params.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (response.ok) {
      return response.json();
    }

    const errorData = await response.json();

    if (errorData.error === 'authorization_pending') {
      continue;
    }

    throw new Error(`Device code polling failed: ${errorData.error} - ${errorData.error_description || ''}`);
  }

  throw new Error('Device code expired - authentication timed out');
}

export async function executeDeviceFlow(params: DeviceFlowParams): Promise<DeviceCodeTokenResponse> {
  const deviceCodeUrl = `https://${params.aicBaseUrl}/am/oauth2/device/code`;

  try {
    const deviceData = await requestDeviceCode({
      scopes: params.scopes,
      clientId: params.clientId,
      deviceCodeUrl,
      verifierState: params.verifierState,
    });

    const { randomUUID } = await import('crypto');
    const elicitationId = randomUUID();

    console.error('Requesting user authentication via device code flow...');

    const elicitationResult = await params.mcpServer.server.elicitInput({
      mode: 'form',
      message: `Please authenticate with PingOne AIC by opening this URL in your browser:\n\n${deviceData.verification_uri_complete}\n\nPlease respond after you complete authentication.`,
      requestedSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
      elicitationId,
    });

    if (elicitationResult.action !== 'accept') {
      console.error('User cancelled authentication. Action:', elicitationResult.action);
      throw new Error(`User cancelled authentication (action: ${elicitationResult.action})`);
    }

    console.error('User accepted authentication prompt, polling for token...');
    let tokenData: DeviceCodeTokenResponse;
    try {
      tokenData = await pollForToken({
        deviceCode: deviceData.device_code,
        interval: deviceData.interval,
        expiresIn: deviceData.expires_in,
        tokenUrl: params.tokenUrl,
        clientId: params.clientId,
        verifierState: params.verifierState,
      });
      console.error('Polling completed successfully');
    } catch (pollError: unknown) {
      const errorMessage = pollError instanceof Error ? pollError.message : String(pollError);
      console.error('Polling failed:', errorMessage);
      throw new Error(
        `Polling failed after user confirmed authentication. Error: ${errorMessage}. ` +
        `This suggests the user may not have completed authentication at PingOne AIC before confirming.`
      );
    }

    const tokenToStore: TokenData = {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      aicBaseUrl: params.aicBaseUrl,
    };

    await params.storage.setToken(tokenToStore);

    try {
      await params.mcpServer.server.notification({
        method: 'notifications/elicitation/complete',
        params: { elicitationId },
      });
    } catch (error) {
      console.error('Failed to send elicitation completion notification:', error);
    }

    console.error('✅ Device code authentication successful');
    return tokenData;
  } catch (error) {
    console.error('Device code authentication failed:', error);
    throw error;
  } finally {
    params.verifierState.clear();
  }
}
