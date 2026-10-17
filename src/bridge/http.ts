import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { writeFileSync } from "node:fs";
import { executeEdit, drainQueuedCommands, resolveEditResult } from './queue.js';
import { isPluginConnected, markPluginPoll } from './status.js';
import type { EditCommandType, EditResult } from '../types/commands.js';
import { applyVariation, discardNode, explore, listAppliedNodes, listRegisteredVariations } from '../parallel/pipeline.js';
import { readPanelHtml } from '../ui/panel.js';

/**
 * Bridge security posture
 * -----------------------
 * - Binds to loopback only by default (`127.0.0.1`). Override with
 *   FIGMA_BRIDGE_HOST at your own risk; a non-loopback bind is logged loudly.
 * - CORS is an allowlist, not a wildcard. The Figma plugin iframe sends
 *   `Origin: null`, so `null` is allowed alongside loopback origins.
 * - The shared token is compared with a constant-time-ish check and is never
 *   written to logs. The Figma personal access token is never exposed here.
 */
const bridgeToken = process.env.FIGMA_BRIDGE_TOKEN ?? 'local-development-token';
const host = process.env.FIGMA_BRIDGE_HOST ?? '127.0.0.1';
const isProduction = process.env.NODE_ENV === 'production';
export let activePort = 0;

if (isProduction && bridgeToken === 'local-development-token') {
  throw new Error('Refusing to start in production with the default FIGMA_BRIDGE_TOKEN. Set a strong token.');
}

const ALLOWED_ORIGINS = new Set([
  'null',
  'http://127.0.0.1',
  'http://localhost',
  ...Array.from({ length: 11 }, (_, i) => `http://localhost:${3000 + i}`),
  ...Array.from({ length: 11 }, (_, i) => `http://127.0.0.1:${3000 + i}`),
]);

const corsHeaders = (origin: string | undefined): Record<string, string> => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Token',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  else if (origin && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
};

const sendJson = (response: ServerResponse, status: number, body: unknown, origin?: string) => {
  response.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
  response.end(JSON.stringify(body));
};

const readBody = async (request: IncomingMessage, limitBytes = 2_000_000): Promise<string> => {
  let body = "";
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) throw new Error('Request body too large');
    body += chunk;
  }
  return body;
};

const tokenMatches = (provided: unknown): boolean => {
  if (typeof provided !== 'string' || provided.length !== bridgeToken.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ bridgeToken.charCodeAt(i);
  return diff === 0;
};

export const bridgeServer = createServer(async (request, response) => {
  const origin = request.headers.origin as string | undefined;
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  // Public, minimal liveness probe. Does not disclose auth state or tokens.
  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/status")) {
    sendJson(
      response,
      200,
      { ok: true, name: "figma-bridge", port: activePort, pluginConnected: isPluginConnected() },
      origin,
    );
    return;
  }

  // Every route except the bare liveness probe requires the bridge token.
  // `/commands` and `/results/*` are part of the polling fallback and must be
  // gated too, or a queued command payload could be read and its reply forged.
  const needsAuth = url.pathname !== '/health' && url.pathname !== '/status';
  const isPanelPage = request.method === 'GET' && (url.pathname === '/' || url.pathname === '/parallel');
  // A browser cannot attach an X-Bridge-Token header to a top-level navigation,
  // so the panel page may also carry the token in the query string. API routes
  // (and the panel's own fetches) still use the header.
  const providedToken =
    request.headers["x-bridge-token"] ?? (isPanelPage ? url.searchParams.get('token') : undefined);
  if (needsAuth && !tokenMatches(providedToken)) {
    sendJson(response, 401, { error: "Invalid bridge token" }, origin);
    return;
  }

  // --- PARALLEL panel -----------------------------------------------------
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/parallel")) {
    const html = readPanelHtml(bridgeToken);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...corsHeaders(origin) });
    response.end(html);
    return;
  }

  if (request.method === "GET" && url.pathname === "/parallel/state") {
    sendJson(response, 200, { ok: true, pluginConnected: isPluginConnected(), registered: listRegisteredVariations(), applied: listAppliedNodes() }, origin);
    return;
  }

  if (request.method === "POST" && url.pathname === "/parallel/explore") {
    try {
      const parsed = JSON.parse((await readBody(request)) || '{}') as { nodeId?: string; name?: string; scale?: number };
      const result = await explore(executeEdit, parsed);
      sendJson(response, 200, { ok: true, result }, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /no figma plugin is connected/i.test(message) ? 409 : /^Unexpected token|JSON/i.test(message) ? 400 : 502;
      sendJson(response, status, { ok: false, error: message }, origin);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/parallel/apply") {
    try {
      const parsed = JSON.parse((await readBody(request)) || '{}') as { variationId?: string; approved?: boolean };
      if (!parsed.variationId) throw new Error('variationId is required');
      const applied = await applyVariation(executeEdit, { variationId: parsed.variationId, approved: parsed.approved === true });
      sendJson(response, applied.success ? 200 : 502, { ok: applied.success, applied }, origin);
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }, origin);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/parallel/discard") {
    try {
      const parsed = JSON.parse((await readBody(request)) || '{}') as { nodeId?: string };
      if (!parsed.nodeId) throw new Error('nodeId is required');
      const result = await discardNode(executeEdit, parsed.nodeId);
      sendJson(response, result.discarded ? 200 : 502, { ok: result.discarded, result }, origin);
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) }, origin);
    }
    return;
  }

  // --- Generic bridge commands -------------------------------------------
  if (request.method === "POST" && (url.pathname === "/execute" || url.pathname === "/command")) {
    try {
      const parsed = JSON.parse(await readBody(request));
      const type = (parsed.type || parsed.action) as EditCommandType;
      const payload = (parsed.payload || parsed) as Record<string, unknown>;
      const result = await executeEdit(type, payload);
      sendJson(response, 200, result, origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(response, 500, { ok: false, code: 'BAD_REQUEST', error: message } satisfies EditResult, origin);
    }
    return;
  }

  // --- HTTP polling fallback (used only when the WebSocket is unavailable) -
  if (request.method === "GET" && url.pathname === "/commands") {
    markPluginPoll();
    sendJson(response, 200, drainQueuedCommands(), origin);
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/results/")) {
    const id = decodeURIComponent(url.pathname.slice("/results/".length));
    try {
      const result = JSON.parse(await readBody(request)) as EditResult;
      const resolved = resolveEditResult(id, result);
      sendJson(response, resolved ? 200 : 404, { ok: resolved }, origin);
    } catch {
      sendJson(response, 400, { ok: false, error: 'Malformed result payload' }, origin);
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" }, origin);
});

export const startBridgeServer = async (startPort: number, maxAttempts = 20): Promise<number> => {
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.error(`[figma-bridge] WARNING: binding to ${host}. The bridge can execute code in Figma and must not be exposed to untrusted networks.`);
  }

  for (let offset = 0; offset < maxAttempts; offset++) {
    const currentPort = startPort + offset;
    const listenSuccess = await new Promise<boolean>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`[figma-bridge] Port ${currentPort} is busy, checking next port...`);
        } else {
          console.error(`[figma-bridge] Bridge server error on port ${currentPort}:`, err);
        }
        bridgeServer.removeListener("listening", onListening);
        resolve(false);
      };
      const onListening = () => {
        bridgeServer.removeListener("error", onError);
        resolve(true);
      };
      bridgeServer.once("error", onError);
      bridgeServer.once("listening", onListening);
      bridgeServer.listen(currentPort, host);
    });

    if (listenSuccess) {
      activePort = currentPort;
      try {
        writeFileSync(".bridge-port", String(activePort));
      } catch {
        // ignore file write errors
      }
      console.error(`[figma-bridge] Bridge listening on http://${host}:${activePort} (PARALLEL panel: /parallel)`);
      return activePort;
    }
  }
  throw new Error(`Could not find an available port starting from ${startPort} (tried ${maxAttempts} ports)`);
};
