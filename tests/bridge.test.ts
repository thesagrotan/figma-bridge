import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { TINY_PNG_BASE64, rawCard } from './fixtures.js';
import type { EditResult } from '../src/types/commands.js';
import type { explore as ExploreFn } from '../src/parallel/pipeline.js';

const TOKEN = 'test-token-parallel-9f2';
const PORT = 34117;

process.env.FIGMA_BRIDGE_TOKEN = TOKEN;
process.env.NODE_ENV = 'test';

let server: import('node:http').Server;
let baseUrl = '';
let plugin: WebSocket;
let received: string[] = [];
let executeEdit: (type: string, payload: Record<string, unknown>) => Promise<EditResult>;
let explore: typeof ExploreFn;

/** Emulates plugin/code.js for the PARALLEL commands over the real WebSocket. */
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

    if (command.type === 'parallel_snapshot') return socket.send(reply(command.id, rawCard()));
    if (command.type === 'export_node') return socket.send(reply(command.id, { base64: TINY_PNG_BASE64 }));
    if (command.type === 'parallel_preview') return socket.send(reply(command.id, { base64: TINY_PNG_BASE64, width: 640, height: 360, warnings: [] }));
    if (command.type === 'parallel_apply')
      return socket.send(reply(command.id, { createdNodeId: '9:9', createdNodeName: 'Revenue Card · refine', appliedKinds: ['itemSpacing'], warnings: [] }));
    if (command.type === 'parallel_discard') return socket.send(reply(command.id, { removedNodeId: command.payload.nodeId }));
    // Unhandled commands (e.g. use_figma in the timeout test) stay silent.
  });
  return socket;
};

const reply = (id: string, result: unknown) => JSON.stringify({ type: 'result', id, result: { ok: true, result } });

beforeAll(async () => {
  const http = await import('../src/bridge/http.js');
  const ws = await import('../src/bridge/websocket.js');
  const queue = await import('../src/bridge/queue.js');
  const pipeline = await import('../src/parallel/pipeline.js');

  const port = await http.startBridgeServer(PORT, 5);
  ws.attachWebSocketUpgrade(http.bridgeServer, TOKEN);

  server = http.bridgeServer;
  baseUrl = `http://127.0.0.1:${port}`;
  executeEdit = queue.executeEdit as typeof executeEdit;
  explore = pipeline.explore;

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

  it('gates the panel and the exploration API behind the bridge token', async () => {
    expect((await fetch(`${baseUrl}/parallel`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/parallel/explore`, { method: 'POST', body: '{}' })).status).toBe(401);
  });

  it('gates the polling fallback routes too (no payload reads, no forged replies)', async () => {
    expect((await fetch(`${baseUrl}/commands`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/results/whatever`, { method: 'POST', body: '{"ok":true}' })).status).toBe(401);

    const authed = await fetch(`${baseUrl}/commands`, { headers: { 'X-Bridge-Token': TOKEN } });
    expect(authed.status).toBe(200);
    expect(Array.isArray(await authed.json())).toBe(true);
  });

  it('serves the PARALLEL panel and injects the token for local use', async () => {
    const response = await fetch(`${baseUrl}/parallel`, { headers: { 'X-Bridge-Token': TOKEN } });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('PARALLEL');
    expect(html).toContain(JSON.stringify(TOKEN));
  });

  it('lets a browser open the panel with a token in the query string', async () => {
    const response = await fetch(`${baseUrl}/parallel?token=${TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    expect((await fetch(`${baseUrl}/parallel?token=wrong`)).status).toBe(401);
    // The query-string escape hatch must not apply to API routes.
    expect((await fetch(`${baseUrl}/parallel/state?token=${TOKEN}`)).status).toBe(401);
  });

  it('drives the whole loop end to end through the real WS bridge', async () => {
    received = [];
    const result = await explore(executeEdit, {});

    expect(result.snapshot.root.id).toBe('1:100');
    expect(result.variations).toHaveLength(3);
    expect(result.previews.originalBase64).toBe(TINY_PNG_BASE64);
    expect(result.previews.previews.map((p) => p.status)).toEqual(['ready', 'ready', 'ready']);
    expect(received).toContain('parallel_snapshot');
    expect(received.filter((t) => t === 'parallel_preview')).toHaveLength(3);
  });

  it('applies to a duplicate and discards it over the same transport', async () => {
    received = [];
    await explore(executeEdit, {});
    const { applyVariation, discardNode } = await import('../src/parallel/pipeline.js');

    const applied = await applyVariation(executeEdit, { variationId: 'refine:1:100', approved: true });
    expect(applied.success).toBe(true);
    expect(applied.createdNodeId).toBe('9:9');

    const discarded = await discardNode(executeEdit, applied.createdNodeId!);
    expect(discarded.discarded).toBe(true);
    expect(received).toContain('parallel_apply');
    expect(received).toContain('parallel_discard');
  });

  it('exposes the exploration endpoint over HTTP for the panel', async () => {
    const response = await fetch(`${baseUrl}/parallel/explore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': TOKEN },
      body: JSON.stringify({}),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.result.variations).toHaveLength(3);
    expect(body.result.previews.previews).toHaveLength(3);
  });

  it('reports queue timeouts instead of hanging forever', async () => {
    process.env.FIGMA_COMMAND_TIMEOUT_MS = '150';
    const result = await executeEdit('use_figma', { code: 'return 1' });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('TIMEOUT');
    delete process.env.FIGMA_COMMAND_TIMEOUT_MS;
  });
});
