import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { writeFileSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";

const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
const bridgeToken = process.env.FIGMA_BRIDGE_TOKEN ?? "local-development-token";
const bridgePort = Number(process.env.PORT ?? 3000);
let activePort = bridgePort;

if (!token) {
  throw new Error("FIGMA_PERSONAL_ACCESS_TOKEN is required");
}

const figma = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`https://api.figma.com${path}`, {
    ...init,
    headers: {
      "X-Figma-Token": token,
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Figma API ${response.status}: ${message}`);
  }

  return (await response.json()) as T;
};

const fileKeySchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    const match = value.match(/figma\.com\/(?:design|file)\/([^/?]+)/);
    return match?.[1] ?? value;
  });

const server = new McpServer({
  name: "figma-mcp",
  version: "0.1.0",
});

type EditCommand = {
  id: string;
  type: "create_frame" | "create_text" | "update_node" | "delete_node" | "batch";
  payload: Record<string, unknown>;
};

type EditResult = { ok: boolean; result?: unknown; error?: string };
const editQueue: EditCommand[] = [];
const editWaiters = new Map<string, (result: EditResult) => void>();
const wsClients = new Set<WebSocket>();

const sendJson = (response: import("node:http").ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(body));
};

const bridgeServer = createServer(async (request, response) => {
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
      name: "figma-mcp",
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

const wsServer = new WebSocketServer({ noServer: true });

bridgeServer.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const providedToken = url.searchParams.get("token") ?? request.headers["x-bridge-token"];
  if (providedToken !== bridgeToken) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(request, socket, head, (ws) => {
    wsServer.emit("connection", ws, request);
  });
});

wsServer.on("connection", (ws) => {
  wsClients.add(ws);
  console.error("[figma-mcp] Plugin connected via WebSocket (real-time push active)");

  while (editQueue.length > 0) {
    const cmd = editQueue.shift();
    if (cmd) {
      ws.send(JSON.stringify({ type: "command", command: cmd }));
    }
  }

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "result" && msg.id) {
        const waiter = editWaiters.get(msg.id);
        if (waiter) {
          editWaiters.delete(msg.id);
          waiter(msg.result as EditResult);
        }
      }
    } catch {
      // ignore malformed payloads
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
    console.error("[figma-mcp] Plugin WebSocket disconnected");
  });

  ws.on("error", () => {
    wsClients.delete(ws);
  });
});

const startBridgeServer = async (startPort: number, maxAttempts = 20): Promise<number> => {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const currentPort = startPort + offset;
    const listenSuccess = await new Promise<boolean>((resolve) => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`[figma-mcp] Port ${currentPort} is busy, checking next port...`);
          bridgeServer.removeListener("listening", onListening);
          resolve(false);
        } else {
          console.error(`[figma-mcp] Bridge server error on port ${currentPort}:`, err);
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
      console.error(`[figma-mcp] Bridge server listening on http://localhost:${activePort} (0.0.0.0)`);
      return activePort;
    }
  }
  throw new Error(`Could not find an available port starting from ${startPort} (tried ${maxAttempts} ports)`);
};

const executeEdit = (type: EditCommand["type"], payload: Record<string, unknown>) => {
  const command = { id: randomUUID(), type, payload } satisfies EditCommand;

  let dispatchedDirectly = false;
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "command", command }));
      dispatchedDirectly = true;
      break;
    }
  }

  if (!dispatchedDirectly) {
    editQueue.push(command);
  }

  return new Promise<EditResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      editWaiters.delete(command.id);
      reject(new Error(`Timed out waiting for the Figma plugin. Ensure the plugin is running and connected to port ${activePort}.`));
    }, 60_000);
    editWaiters.set(command.id, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
};

server.registerTool(
  "figma_get_file",
  {
    description:
      "Get a Figma file's metadata and document tree. Accepts a file key or Figma URL.",
    inputSchema: {
      fileKey: fileKeySchema.describe("Figma file key or file URL"),
      version: z.string().optional().describe("Optional Figma file version ID"),
      depth: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum document tree depth to return"),
    },
  },
  async ({ fileKey, version, depth }) => {
    const params = new URLSearchParams();
    if (version) params.set("version", version);
    if (depth) params.set("depth", String(depth));
    const query = params.size ? `?${params.toString()}` : "";
    const result = await figma<Record<string, unknown>>(
      `/v1/files/${encodeURIComponent(fileKey)}${query}`,
    );

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  "figma_edit",
  {
    description:
      "Edit the open Figma file through the local Figma plugin bridge. Supports 'create_frame', 'create_text', 'update_node', 'delete_node', and 'batch' (execute multiple operations in payload.operations). The plugin must be running.",
    inputSchema: {
      type: z.enum(["create_frame", "create_text", "update_node", "delete_node", "batch"]),
      payload: z.record(z.unknown()).default({}),
    },
  },
  async ({ type, payload }) => {
    const result = await executeEdit(type, payload);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  "figma_get_nodes",
  {
    description:
      "Get specific Figma nodes by ID. Accepts a file key or Figma URL and comma-separated node IDs.",
    inputSchema: {
      fileKey: fileKeySchema.describe("Figma file key or file URL"),
      nodeIds: z
        .array(z.string().trim().min(1))
        .min(1)
        .describe("Node IDs such as 0:1 or 12:34"),
      version: z.string().optional().describe("Optional Figma file version ID"),
    },
  },
  async ({ fileKey, nodeIds, version }) => {
    const params = new URLSearchParams({ ids: nodeIds.join(",") });
    if (version) params.set("version", version);
    const result = await figma<Record<string, unknown>>(
      `/v1/files/${encodeURIComponent(fileKey)}/nodes?${params.toString()}`,
    );

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  "figma_render_nodes",
  {
    description: "Get image URLs for rendering specific Figma nodes.",
    inputSchema: {
      fileKey: fileKeySchema.describe("Figma file key or file URL"),
      nodeIds: z.array(z.string().trim().min(1)).min(1),
      format: z.enum(["jpg", "png", "svg", "pdf"]).default("png"),
      scale: z.number().min(0.01).max(4).default(1),
    },
  },
  async ({ fileKey, nodeIds, format, scale }) => {
    const params = new URLSearchParams({
      ids: nodeIds.join(","),
      format,
      scale: String(scale),
    });
    const result = await figma<Record<string, unknown>>(
      `/v1/images/${encodeURIComponent(fileKey)}?${params.toString()}`,
    );

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

await startBridgeServer(bridgePort);

const transport = new StdioServerTransport();
await server.connect(transport);
