import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bridgeServer, startBridgeServer } from '../src/bridge/http.js';
import { drainQueuedCommands, editQueue, executeEdit } from '../src/bridge/queue.js';
import { markPluginPoll } from '../src/bridge/status.js';
import type { EditCommand } from '../src/types/commands.js';

const TOKEN = 'test-token-polling-7c3';
const PORT = 34119;

let baseUrl = '';

beforeAll(async () => {
  const port = await startBridgeServer(TOKEN, PORT, 5);
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => bridgeServer.close(() => resolve()));
});

const authed = { 'X-Bridge-Token': TOKEN, 'Content-Type': 'application/json' };

describe('HTTP polling fallback', () => {
  it('fails fast when neither a socket nor a polling plugin is present', async () => {
    const result = await executeEdit('use_figma', { code: 'offline' });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('NO_PLUGIN');
    expect(editQueue).toHaveLength(0);
  });

  it('drains a live command and accepts its result', async () => {
    markPluginPoll();
    const pending = executeEdit('use_figma', { code: 'polled' });
    expect(editQueue).toHaveLength(1);

    const commands = (await (await fetch(`${baseUrl}/commands`, { headers: authed })).json()) as EditCommand[];
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe('use_figma');
    expect(typeof commands[0].expiresAt).toBe('number');

    const response = await fetch(`${baseUrl}/results/${commands[0].id}`, {
      method: 'POST',
      headers: authed,
      body: JSON.stringify({ ok: true, result: { polled: true } }),
    });
    expect(response.status).toBe(200);

    await expect(pending).resolves.toEqual({ ok: true, result: { polled: true } });
  });

  it('removes a timed-out command from the queue so it cannot run later', async () => {
    process.env.FIGMA_COMMAND_TIMEOUT_MS = '100';
    markPluginPoll();

    const pending = executeEdit('use_figma', { code: 'never' });
    expect(editQueue).toHaveLength(1);

    const result = await pending;
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe('TIMEOUT');
    expect(editQueue).toHaveLength(0);
    expect(drainQueuedCommands()).toEqual([]);

    const commands = (await (await fetch(`${baseUrl}/commands`, { headers: authed })).json()) as EditCommand[];
    expect(commands).toEqual([]);

    delete process.env.FIGMA_COMMAND_TIMEOUT_MS;
  });

});
