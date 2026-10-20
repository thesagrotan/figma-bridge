import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { bridgeServer, startBridgeServer } from './bridge/http.js';
import { attachWebSocketUpgrade } from './bridge/websocket.js';
import { registerCanvasTools } from './tools/canvas.js';

const bridgeToken = process.env.FIGMA_BRIDGE_TOKEN ?? 'local-development-token';
const bridgePort = Number(process.env.PORT ?? 3000);

const server = new McpServer({ name: 'figma-bridge', version: '0.1.0' });

registerCanvasTools(server);

await startBridgeServer(bridgePort);
attachWebSocketUpgrade(bridgeServer, bridgeToken);

const transport = new StdioServerTransport();
await server.connect(transport);
