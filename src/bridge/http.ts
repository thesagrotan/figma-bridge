import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { drainQueuedCommands, resolveEditResult } from './queue.js';
import { isPluginConnected, markPluginPoll } from './status.js';
import type { EditResult } from '../types/commands.js';
import { tokensMatch } from './token.js';

/**
 * Bridge security posture
 * -----------------------
 * - Binds to loopback only (`127.0.0.1`) and rejects non-loopback Host headers.
 * - CORS is an allowlist, not a wildcard. The Figma plugin iframe sends
 *   `Origin: null`, so `null` is allowed alongside loopback origins.
 * - The shared token is compared with a constant-time-ish check and is never
 *   written to logs.
 */
const host = '127.0.0.1';
let bridgeToken = '';
export let activePort = 0;

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;
const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i;

export const isAllowedHost = (value: string | undefined): boolean =>
  typeof value === 'string' && LOOPBACK_HOST.test(value);

export const isAllowedOrigin = (value: string | undefined): boolean =>
  value === undefined || value === 'null' || LOOPBACK_ORIGIN.test(value);

const corsHeaders = (origin: string | undefined): Record<string, string> => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Token',
    Vary: 'Origin',
  };
  if (origin && (origin === 'null' || LOOPBACK_ORIGIN.test(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
};

const sendJson = (response: ServerResponse, status: number, body: unknown, origin?: string) => {
  response.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
  response.end(JSON.stringify(body));
};

const readBody = async (request: IncomingMessage, limitBytes = 2_000_000): Promise<string> => {
  let body = '';
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) throw new Error('Request body too large');
    body += chunk;
  }
  return body;
};

const tokenMatches = (provided: unknown): boolean => tokensMatch(provided, bridgeToken);

export const bridgeServer = createServer(async (request, response) => {
  const origin = request.headers.origin as string | undefined;
  const hostHeader = request.headers.host as string | undefined;

  if (!isAllowedHost(hostHeader)) {
    sendJson(response, 403, { error: 'Invalid Host header' }, origin);
    return;
  }

  const url = new URL(request.url ?? '/', `http://${hostHeader}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  // Public, minimal liveness probe. Does not disclose auth state or tokens.
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(
      response,
      200,
      { ok: true, name: 'figma-mcp-unchained', port: activePort, pluginConnected: isPluginConnected() },
      origin,
    );
    return;
  }

  // `/commands` and `/results/*` are the polling fallback and are token-gated
  // too, or a queued command payload could be read and its reply forged.
  const providedToken = request.headers['x-bridge-token'];
  if (!tokenMatches(providedToken)) {
    sendJson(response, 401, { error: 'Invalid bridge token' }, origin);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/commands') {
    markPluginPoll();
    sendJson(response, 200, drainQueuedCommands(), origin);
    return;
  }

  if (request.method === 'POST' && url.pathname.startsWith('/results/')) {
    const id = decodeURIComponent(url.pathname.slice('/results/'.length));
    try {
      const result = JSON.parse(await readBody(request)) as EditResult;
      const resolved = resolveEditResult(id, result);
      sendJson(response, resolved ? 200 : 404, { ok: resolved }, origin);
    } catch {
      sendJson(response, 400, { ok: false, error: 'Malformed result payload' }, origin);
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found' }, origin);
});

export const startBridgeServer = async (
  token: string,
  startPort: number,
  maxAttempts = 20,
): Promise<number> => {
  bridgeToken = token;

  for (let offset = 0; offset < maxAttempts; offset++) {
    const currentPort = startPort + offset;
    const listenSuccess = await new Promise<boolean>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[figma-mcp-unchained] Port ${currentPort} is busy, checking next port...`);
        } else {
          console.error(`[figma-mcp-unchained] Bridge server error on port ${currentPort}:`, err);
        }
        bridgeServer.removeListener('listening', onListening);
        resolve(false);
      };
      const onListening = () => {
        bridgeServer.removeListener('error', onError);
        resolve(true);
      };
      bridgeServer.once('error', onError);
      bridgeServer.once('listening', onListening);
      bridgeServer.listen(currentPort, host);
    });

    if (listenSuccess) {
      activePort = currentPort;
      console.error(`[figma-mcp-unchained] Bridge listening on http://${host}:${activePort}`);
      return activePort;
    }
  }
  throw new Error(`Could not find an available port starting from ${startPort} (tried ${maxAttempts} ports)`);
};
