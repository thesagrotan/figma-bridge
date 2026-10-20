import { WebSocketServer } from 'ws';
import { wsClients, editQueue, editWaiters } from './queue.js';
import type { EditResult } from '../types/commands.js';
import { tokensMatch } from './token.js';

export const wsServer = new WebSocketServer({ noServer: true });

export const attachWebSocketUpgrade = (httpServer: import('node:http').Server, bridgeToken: string): void => {
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
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
  wsClients.add(ws);
  console.error('[figma-bridge] Plugin connected via WebSocket (real-time push active)');

  while (editQueue.length > 0) {
    const cmd = editQueue.shift();
    if (cmd) {
      ws.send(JSON.stringify({ type: 'command', command: cmd }));
    }
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'result' && msg.id) {
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

  ws.on('close', () => {
    wsClients.delete(ws);
    console.error('[figma-bridge] Plugin WebSocket disconnected');
  });

  ws.on('error', () => {
    wsClients.delete(ws);
  });
});
