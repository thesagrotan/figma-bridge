import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { bridgeServer, startBridgeServer } from './bridge/http.js';
import { attachWebSocketUpgrade } from './bridge/websocket.js';
import { loadOrCreateBridgeToken } from './bridge/token.js';
import { registerTools } from './tools/index.js';

const resolvedToken = loadOrCreateBridgeToken();
if (resolvedToken.path) {
  console.error(
    `[figma-mcp-unchained] Bridge token ${resolvedToken.created ? 'generated at' : 'loaded from'} ${resolvedToken.path}`,
  );
}
const bridgePort = Number(process.env.PORT ?? 3000);

const server = new McpServer({ name: 'figma-mcp-unchained', version: '0.1.0' });

registerTools(server);

await startBridgeServer(resolvedToken.token, bridgePort);
attachWebSocketUpgrade(bridgeServer, resolvedToken.token);

const transport = new StdioServerTransport();
await server.connect(transport);
