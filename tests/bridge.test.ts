import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import { WebSocket } from 'ws';
import { isAllowedHost, isAllowedOrigin } from '../src/bridge/http.js';
import type { EditResult } from '../src/types/commands.js';

const TOKEN = 'test-token-bridge-9f2';
const PORT = 34117;
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

process.env.NODE_ENV = 'test';

let server: import('node:http').Server;
let baseUrl = '';
let plugin: WebSocket;
let received: string[] = [];
let cancelled: string[] = [];
let executeEdit: (type: string, payload: Record<string, unknown>, file?: string) => Promise<EditResult>;

const reply = (id: string, result: unknown) => JSON.stringify({ type: 'result', id, result: { ok: true, result } });

const startMockPlugin = async (port: number, hello?: { sessionId: string; fileName: string; pageName: string }): Promise<WebSocket> => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=${encodeURIComponent(TOKEN)}`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  if (hello) socket.send(JSON.stringify({ type: 'hello', ...hello }));
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type === 'cancel') {
      cancelled.push(message.id);
      return;
    }
    if (message.type !== 'command') return;
    const { command } = message;
    received.push(command.type);

    if (command.type === 'use_figma') {
      if (command.payload?.code === 'hang') return;
      if (command.payload?.code === 'late') {
        setTimeout(() => socket.send(reply(command.id, 'late result')), 200);
        return;
      }
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

  const port = await http.startBridgeServer(TOKEN, PORT, 5);
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

describe('host and origin policy', () => {
  it('accepts only loopback Host headers', () => {
    expect(isAllowedHost('127.0.0.1')).toBe(true);
    expect(isAllowedHost('127.0.0.1:3000')).toBe(true);
    expect(isAllowedHost('localhost')).toBe(true);
    expect(isAllowedHost('localhost:31337')).toBe(true);
    expect(isAllowedHost('evil.example')).toBe(false);
    expect(isAllowedHost('127.0.0.1.evil.example')).toBe(false);
    expect(isAllowedHost('[::1]:3000')).toBe(false);
    expect(isAllowedHost(undefined)).toBe(false);
  });

  it('allows absent, null and loopback Origins only', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('null')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('https://127.0.0.1:3000')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example')).toBe(false);
  });

  it('rejects a non-loopback Host header over HTTP', async () => {
    const port = new URL(baseUrl).port;
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        { host: '127.0.0.1', port, path: '/health', headers: { Host: 'evil.example' } },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect(status).toBe(403);
  });

  it('rejects a WebSocket upgrade from a foreign Origin', async () => {
    const url = `ws://127.0.0.1:${new URL(baseUrl).port}?token=${encodeURIComponent(TOKEN)}`;
    const attempt = (origin: string) =>
      new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url, { headers: { Origin: origin } });
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
        socket.once('unexpected-response', (_request, response) => reject(new Error(`status ${response.statusCode}`)));
      });

    await expect(attempt('https://evil.example')).rejects.toThrow(/403/);

    const loopback = await attempt('http://localhost:3000');
    loopback.close();
    const nullOrigin = await attempt('null');
    nullOrigin.close();
  });
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

  it('gates the polling result route behind the bridge token', async () => {
    expect((await fetch(`${baseUrl}/results/whatever`, { method: 'POST', body: '{"ok":true}' })).status).toBe(401);
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

  it('times out, removes the waiter and asks the plugin to cancel', async () => {
    process.env.FIGMA_COMMAND_TIMEOUT_MS = '150';
    received = [];
    cancelled = [];
    const result = await executeEdit('use_figma', { code: 'hang' });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('TIMEOUT');
    expect(received).toEqual(['use_figma']);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cancelled).toHaveLength(1);
    delete process.env.FIGMA_COMMAND_TIMEOUT_MS;
  });

  it('ignores a late result after the command timed out', async () => {
    process.env.FIGMA_COMMAND_TIMEOUT_MS = '100';
    const result = await executeEdit('use_figma', { code: 'late' });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('TIMEOUT');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const queue = await import('../src/bridge/queue.js');
    expect(queue.editWaiters.size).toBe(0);
    delete process.env.FIGMA_COMMAND_TIMEOUT_MS;
  });
});
