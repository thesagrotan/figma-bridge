import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { EditResult } from '../src/types/commands.js';

const TOKEN = 'test-token-bridge-9f2';
const PORT = 34117;
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

process.env.FIGMA_BRIDGE_TOKEN = TOKEN;
process.env.NODE_ENV = 'test';

let server: import('node:http').Server;
let baseUrl = '';
let plugin: WebSocket;
let received: string[] = [];
let executeEdit: (type: string, payload: Record<string, unknown>) => Promise<EditResult>;

const reply = (id: string, result: unknown) => JSON.stringify({ type: 'result', id, result: { ok: true, result } });

const startMockPlugin = async (port: number): Promise<WebSocket> => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=${encodeURIComponent(TOKEN)}`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type !== 'command') return;
    const { command } = message;
    received.push(command.type);

    if (command.type === 'use_figma') {
      if (command.payload?.code === 'hang') return;
      return socket.send(reply(command.id, { name: 'Test File', value: command.payload.code }));
    }
    if (command.type === 'export_node') {
      return socket.send(reply(command.id, { id: '1:100', name: 'Card', format: 'PNG', base64: TINY_PNG_BASE64 }));
    }
    if (command.type === 'get_node_tree') {
      return socket.send(reply(command.id, { id: '1:100', name: 'Card', type: 'COMPONENT', children: [] }));
    }
  });
  return socket;
};

beforeAll(async () => {
  const http = await import('../src/bridge/http.js');
  const ws = await import('../src/bridge/websocket.js');
  const queue = await import('../src/bridge/queue.js');

  const port = await http.startBridgeServer(PORT, 5);
  ws.attachWebSocketUpgrade(http.bridgeServer, TOKEN);

  server = http.bridgeServer;
  baseUrl = `http://127.0.0.1:${port}`;
  executeEdit = queue.executeEdit;

  plugin = await startMockPlugin(port);
  await new Promise((resolve) => setTimeout(resolve, 50));
});

afterAll(async () => {
  try { plugin?.close(); } catch {}
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('bridge integration (real HTTP + WebSocket, mock plugin)', () => {
  it('exposes liveness without disclosing auth state', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.pluginConnected).toBe(true);
    expect(Object.keys(body)).not.toContain('authenticated');
  });

  it('never sends a wildcard CORS header', async () => {
    const untrusted = await fetch(`${baseUrl}/health`, { headers: { Origin: 'https://evil.example' } });
    expect(untrusted.headers.get('access-control-allow-origin')).toBeNull();

    const trusted = await fetch(`${baseUrl}/health`, { headers: { Origin: 'http://localhost:3000' } });
    expect(trusted.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('gates the polling fallback routes behind the bridge token', async () => {
    expect((await fetch(`${baseUrl}/commands`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/results/whatever`, { method: 'POST', body: '{"ok":true}' })).status).toBe(401);

    const authed = await fetch(`${baseUrl}/commands`, { headers: { 'X-Bridge-Token': TOKEN } });
    expect(authed.status).toBe(200);
    expect(Array.isArray(await authed.json())).toBe(true);
  });

  it('drives use_figma, get_node_tree and export_node over the real WS bridge', async () => {
    received = [];

    const exec = await executeEdit('use_figma', { code: 'return 7' });
    expect(exec).toEqual({ ok: true, result: { name: 'Test File', value: 'return 7' } });

    const tree = await executeEdit('get_node_tree', { nodeId: '1:100', maxDepth: 2 });
    expect(tree.ok).toBe(true);

    const shot = await executeEdit('export_node', { nodeId: '1:100', format: 'PNG', scale: 2 });
    expect(shot.ok).toBe(true);
    expect((shot as { result: { base64: string } }).result.base64).toBe(TINY_PNG_BASE64);

    expect(received).toEqual(['use_figma', 'get_node_tree', 'export_node']);
  });

  it('reports queue timeouts instead of hanging forever', async () => {
    process.env.FIGMA_COMMAND_TIMEOUT_MS = '150';
    const result = await executeEdit('use_figma', { code: 'hang' });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('TIMEOUT');
    delete process.env.FIGMA_COMMAND_TIMEOUT_MS;
  });

  it('does not resolve a late result after a timeout', async () => {
    const queue = await import('../src/bridge/queue.js');
    expect(queue.resolveEditResult('missing-id', { ok: true, result: 'late' })).toBe(false);
  });
});
