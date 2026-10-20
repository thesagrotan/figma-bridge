import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { EditResult } from '../src/types/commands.js';

const TOKEN = 'test-token-routing-4a1';
const PORT = 34118;

type MockPlugin = { socket: WebSocket; received: string[] };

const reply = (id: string, result: unknown) => JSON.stringify({ type: 'result', id, result: { ok: true, result } });

const startMockPlugin = async (
  port: number,
  hello: { sessionId: string; fileName: string; pageName: string },
): Promise<MockPlugin> => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=${encodeURIComponent(TOKEN)}`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  const received: string[] = [];
  socket.send(JSON.stringify({ type: 'hello', ...hello }));
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (message.type !== 'command') return;
    received.push(`${hello.fileName}:${message.command.payload?.code ?? ''}`);
    socket.send(reply(message.command.id, { file: hello.fileName, code: message.command.payload?.code }));
  });
  return { socket, received };
};

let server: import('node:http').Server;
let executeEdit: (type: string, payload: Record<string, unknown>, file?: string) => Promise<EditResult>;
let queue: typeof import('../src/bridge/queue.js');
let pluginA: MockPlugin;
let pluginB: MockPlugin;

beforeAll(async () => {
  const http = await import('../src/bridge/http.js');
  const ws = await import('../src/bridge/websocket.js');
  queue = await import('../src/bridge/queue.js');

  const port = await http.startBridgeServer(TOKEN, PORT, 5);
  ws.attachWebSocketUpgrade(http.bridgeServer, TOKEN);
  server = http.bridgeServer;
  executeEdit = queue.executeEdit;
  void port;
});

afterAll(async () => {
  try { pluginA?.socket.close(); } catch {}
  try { pluginB?.socket.close(); } catch {}
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('plugin routing', () => {
  it('fails fast with no plugin connected and never queues the command', async () => {
    const result = await executeEdit('use_figma', { code: 'stale' });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('NO_PLUGIN');
    expect((result as { error: string }).error).toMatch(/no figma plugin is connected/i);
    expect(queue.editQueue).toHaveLength(0);
  });

  it('never runs a command that failed with no plugin after one connects', async () => {
    pluginA = await startMockPlugin(PORT, { sessionId: 'sess-a', fileName: 'Alpha', pageName: 'Page A' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pluginA.received).toEqual([]);
    expect(queue.editQueue).toHaveLength(0);

    const result = await executeEdit('use_figma', { code: 'first' });
    expect((result as { result: { file: string } }).result.file).toBe('Alpha');
    expect(pluginA.received).toEqual(['Alpha:first']);
  });

  it('requires a file when several plugins are connected and lists candidates', async () => {
    pluginB = await startMockPlugin(PORT, { sessionId: 'sess-b', fileName: 'Beta', pageName: 'Page B' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await executeEdit('use_figma', { code: 'none' });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('FILE_REQUIRED');
    const error = (result as { error: string }).error;
    expect(error).toContain('Alpha');
    expect(error).toContain('Beta');
    expect(error).toContain('sess-a');
    expect(error).toContain('sess-b');
    expect(pluginA.received).toEqual(['Alpha:first']);
    expect(pluginB.received).toEqual([]);
  });

  it('routes by file name and by session id', async () => {
    const byName = await executeEdit('use_figma', { code: 'to-a' }, 'Alpha');
    expect((byName as { result: { file: string } }).result.file).toBe('Alpha');

    const bySession = await executeEdit('use_figma', { code: 'to-b' }, 'sess-b');
    expect((bySession as { result: { file: string } }).result.file).toBe('Beta');

    expect(pluginA.received).toEqual(['Alpha:first', 'Alpha:to-a']);
    expect(pluginB.received).toEqual(['Beta:to-b']);
  });

  it('returns candidates when the file does not match', async () => {
    const result = await executeEdit('use_figma', { code: 'missing' }, 'Gamma');
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('FILE_NOT_FOUND');
    expect((result as { error: string }).error).toContain('Alpha');
    expect((result as { error: string }).error).toContain('Beta');
  });
});
