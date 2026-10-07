import type { EditCommand, EditCommandType, EditResult } from '../types/commands.js';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

export const wsClients = new Set<WebSocket>();
export const editQueue: EditCommand[] = [];
export const editWaiters = new Map<string, (r: EditResult) => void>();

export const executeEdit = (type: EditCommandType, payload: Record<string, unknown>): Promise<EditResult> => {
  const command = { id: randomUUID(), type, payload } satisfies EditCommand;

  let dispatched = false;
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "command", command }));
      dispatched = true;
      break; // Send to one open client, avoid duplicate duplicate execution across multiple open tabs!
    }
  }
  if (!dispatched) {
    editQueue.push(command);
  }

  return new Promise<EditResult>((resolve) => {
    const timeoutMs = Number(process.env.FIGMA_COMMAND_TIMEOUT_MS ?? 60_000);
    const timeout = setTimeout(() => {
      editWaiters.delete(command.id);
      resolve({ ok: false, code: 'TIMEOUT', error: 'Timed out waiting for the Figma plugin.' });
    }, timeoutMs);

    editWaiters.set(command.id, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
};
