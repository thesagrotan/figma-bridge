import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { bridgeServer, startBridgeServer } from './bridge/http.js';
import { attachWebSocketUpgrade } from './bridge/websocket.js';
import { registerReadTools } from './tools/read.js';
import { registerCanvasTools } from './tools/canvas.js';
import { registerParallelTools } from './tools/parallel.js';

if (!process.env.FIGMA_PERSONAL_ACCESS_TOKEN) {
  throw new Error('FIGMA_PERSONAL_ACCESS_TOKEN is required');
}

const bridgeToken = process.env.FIGMA_BRIDGE_TOKEN ?? 'local-development-token';
const bridgePort = Number(process.env.PORT ?? 3000);

const server = new McpServer({ name: 'figma-bridge', version: '0.1.0' });

registerReadTools(server);
registerCanvasTools(server);
registerParallelTools(server);

await startBridgeServer(bridgePort);
attachWebSocketUpgrade(bridgeServer, bridgeToken);

const transport = new StdioServerTransport();
await server.connect(transport);
