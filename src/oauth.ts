import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

import {
  AUTHORIZE_URL,
  CALLBACK_HOST,
  CALLBACK_PORT,
  DEFAULT_OAUTH_TIMEOUT_MS,
  OAUTH_SCOPES,
  REDIRECT_URI,
  TOKEN_URL,
} from './config';
import { OAuthStartInput, OAuthStartResult, OuraTokenResponse } from './types';

export interface OAuthCaptureOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export function generateRandomToken(length = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

export function buildPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = generateRandomToken(48);
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizeUrl(input: OAuthStartInput): OAuthStartResult {
  const state = generateRandomToken();
  const redirectUri = input.redirectUri ?? REDIRECT_URI;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: redirectUri,
    scope: input.scopes ?? OAUTH_SCOPES,
    state,
  });

  return {
    authorizeUrl: `${AUTHORIZE_URL}?${params.toString()}`,
    state,
    codeVerifier: '',
    codeChallenge: '',
    redirectUri,
  };
}

function postTokenRequest(body: Record<string, string>): Promise<OuraTokenResponse> {
  const postData = new URLSearchParams(body).toString();
  const parsed = new URL(TOKEN_URL);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as OuraTokenResponse);
            } catch {
              reject(new Error(`Failed to parse token response: ${data}`));
            }
            return;
          }

          reject(new Error(`Token request failed (${res.statusCode ?? 'unknown'}): ${data}`));
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

export function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  code: string,
  _codeVerifier: string,
  redirectUri = REDIRECT_URI
): Promise<OuraTokenResponse> {
  return postTokenRequest({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
}

export function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<OuraTokenResponse> {
  return postTokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

export function captureOAuthCallback(
  expectedState: string,
  options: OAuthCaptureOptions = {}
): Promise<string> {
  const host = options.host ?? CALLBACK_HOST;
  const port = options.port ?? CALLBACK_PORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_OAUTH_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      server.close();
      callback();
    };

    const server = http.createServer((req, res) => {
      if (settled) {
        res.writeHead(409);
        res.end('OAuth flow already completed');
        return;
      }

      const requestUrl = req.url ?? '';
      if (!requestUrl.startsWith('/callback')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const url = new URL(requestUrl, `http://${host}:${port}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const state = url.searchParams.get('state');

      if (error) {
        res.writeHead(400);
        res.end(`Authorization error: ${error}`);
        settle(() => reject(new Error(`OAuth error: ${error}`)));
        return;
      }

      if (!code) {
        res.writeHead(200);
        res.end('Waiting for authorization...');
        return;
      }

      if (!state) {
        res.writeHead(400);
        res.end('Missing OAuth state');
        settle(() => reject(new Error('Missing OAuth state in callback')));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400);
        res.end('Invalid OAuth state');
        settle(() => reject(new Error('OAuth callback state mismatch')));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body><h2>Oura authorized.</h2><p>You can close this tab and return to the terminal.</p></body></html>'
      );
      settle(() => resolve(code));
    });

    server.on('error', (error) => {
      settle(() => reject(new Error(`Failed to start OAuth callback server: ${error.message}`)));
    });

    const timeoutId = setTimeout(() => {
      settle(() => reject(new Error('OAuth callback timed out after 2 minutes')));
    }, timeoutMs);

    server.listen(port, host);
  });
}
