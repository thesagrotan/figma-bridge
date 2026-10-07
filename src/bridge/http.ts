import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { editQueue, editWaiters } from './queue.js';
import type { EditResult } from '../types/commands.js';

const bridgeToken = process.env.FIGMA_BRIDGE_TOKEN ?? 'local-development-token';
export let activePort = 0;

const sendJson = (response: import("node:http").ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(body));
};

export const bridgeServer = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Bridge-Token",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && (request.url === "/health" || request.url === "/status")) {
    const providedToken = request.headers["x-bridge-token"];
    sendJson(response, 200, {
      ok: true,
      name: "figma-bridge",
      port: activePort,
      authenticated: Boolean(providedToken && providedToken === bridgeToken),
    });
    return;
  }

  if (request.headers["x-bridge-token"] !== bridgeToken) {
    sendJson(response, 401, { error: "Invalid bridge token" });
    return;
  }

  if (request.method === "GET" && request.url === "/commands") {
    const commands = editQueue.splice(0, editQueue.length);
    sendJson(response, 200, commands);
    return;
  }

  if (request.method === "POST" && request.url?.startsWith("/results/")) {
    const id = request.url.slice("/results/".length);
    let body = "";
    for await (const chunk of request) body += chunk;
    const waiter = editWaiters.get(id);
    if (!waiter) {
      sendJson(response, 404, { error: "Unknown command" });
      return;
    }
    editWaiters.delete(id);
    waiter(JSON.parse(body) as EditResult);
    sendJson(response, 204, null);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

export const startBridgeServer = async (startPort: number, maxAttempts = 20): Promise<number> => {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const currentPort = startPort + offset;
    const listenSuccess = await new Promise<boolean>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`[figma-bridge] Port ${currentPort} is busy, checking next port...`);
          bridgeServer.removeListener("listening", onListening);
          resolve(false);
        } else {
          console.error(`[figma-bridge] Bridge server error on port ${currentPort}:`, err);
          bridgeServer.removeListener("listening", onListening);
          resolve(false);
        }
      };
      const onListening = () => {
        bridgeServer.removeListener("error", onError);
        resolve(true);
      };
      bridgeServer.once("error", onError);
      bridgeServer.once("listening", onListening);
      bridgeServer.listen(currentPort, "0.0.0.0");
    });

    if (listenSuccess) {
      activePort = currentPort;
      try {
        writeFileSync(".bridge-port", String(activePort));
      } catch {
        // ignore file write errors
      }
      console.error(`[figma-bridge] Bridge server listening on http://localhost:${activePort} (0.0.0.0)`);
      return activePort;
    }
  }
  throw new Error(`Could not find an available port starting from ${startPort} (tried ${maxAttempts} ports)`);
};
