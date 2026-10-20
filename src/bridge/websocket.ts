import { WebSocketServer } from 'ws';
import { editWaiters, flushQueuedCommands, resolveEditResult } from './queue.js';
import { isAllowedHost, isAllowedOrigin } from './http.js';
import { openPlugins, registerPlugin, unregisterPlugin, updatePluginSession } from './status.js';
import type { EditResult } from '../types/commands.js';
import { tokensMatch } from './token.js';

export const wsServer = new WebSocketServer({ noServer: true });

export const attachWebSocketUpgrade = (httpServer: import('node:http').Server, bridgeToken: string): void => {
  httpServer.on('upgrade', (request, socket, head) => {
    const hostHeader = request.headers.host as string | undefined;
    const origin = request.headers.origin as string | undefined;

    if (!isAllowedHost(hostHeader) || !isAllowedOrigin(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const url = new URL(request.url ?? '/', `http://${hostHeader}`);
    const providedToken = url.searchParams.get('token') ?? request.headers['x-bridge-token'];
    if (!tokensMatch(providedToken, bridgeToken)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit('connection', ws, request);
    });
  });
};

wsServer.on('connection', (ws) => {
  registerPlugin(ws);
  console.error('[figma-bridge] Plugin connected via WebSocket (real-time push active)');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'hello') {
        updatePluginSession(ws, msg);
        if (openPlugins().length === 1) flushQueuedCommands(ws);
        return;
      }
      if (msg.type === 'result' && msg.id) {
        if (editWaiters.has(msg.id)) resolveEditResult(msg.id, msg.result as EditResult);
      }
    } catch {
      // ignore malformed payloads
    }
  });

  ws.on('close', () => {
    unregisterPlugin(ws);
    console.error('[figma-bridge] Plugin WebSocket disconnected');
  });

  ws.on('error', () => {
    unregisterPlugin(ws);
  });
});
