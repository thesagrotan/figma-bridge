import type { EditCommand, EditCommandType, EditResult } from '../types/commands.js';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { getPluginSession, isPollingActive, listPluginCandidates, openPlugins } from './status.js';

export const editQueue: EditCommand[] = [];
type Waiter = (result: EditResult) => void;
export const editWaiters = new Map<string, Waiter>();

const commandTargets = new Map<string, WebSocket>();
const cancelledIds = new Set<string>();
const CANCELLED_LIMIT = 500;

const rememberCancelled = (id: string): void => {
  cancelledIds.add(id);
  if (cancelledIds.size <= CANCELLED_LIMIT) return;
  const oldest = cancelledIds.values().next().value;
  if (oldest) cancelledIds.delete(oldest);
};

/** Resolve a pending command from the WebSocket or HTTP polling result path. */
export const resolveEditResult = (id: string, result: EditResult): boolean => {
  const waiter = editWaiters.get(id);
  if (!waiter) return false;
  editWaiters.delete(id);
  waiter(result);
  return true;
};

/**
 * Drain queued commands for a polling consumer. Cancelled and expired commands
 * are discarded rather than handed to a plugin that connects later.
 */
export const drainQueuedCommands = (): EditCommand[] => {
  const now = Date.now();
  const ready: EditCommand[] = [];
  for (const command of editQueue) {
    if (cancelledIds.has(command.id)) continue;
    if (command.expiresAt !== undefined && command.expiresAt <= now) {
      rememberCancelled(command.id);
      continue;
    }
    ready.push(command);
  }
  editQueue.length = 0;
  return ready;
};

type TargetSelection =
  | { ok: true; transport: 'ws'; socket: WebSocket }
  | { ok: true; transport: 'poll' }
  | { ok: false; code: string; error: string };

const describeCandidates = (): string =>
  listPluginCandidates()
    .map((candidate) => `${candidate.fileName ?? '(unknown file)'} [${candidate.sessionId ?? 'no session'}]`)
    .join(', ');

/**
 * Pick the plugin window for a command.
 *
 * One window is used automatically. Several windows require the caller to
 * identify one by file name or session id. No plugin (and no recent poll) is a
 * hard failure: commands are never queued for a future connection.
 */
export const selectPluginTarget = (file?: string): TargetSelection => {
  const sockets = openPlugins();

  if (file) {
    const matches = sockets.filter((socket) => {
      const session = getPluginSession(socket);
      return session?.fileName === file || session?.sessionId === file;
    });
    if (matches.length === 1) return { ok: true, transport: 'ws', socket: matches[0] };
    if (matches.length > 1) {
      return {
        ok: false,
        code: 'FILE_AMBIGUOUS',
        error: `More than one Figma plugin matches "${file}". Pass a sessionId instead. Candidates: ${describeCandidates()}.`,
      };
    }
    if (sockets.length === 0 && isPollingActive()) return { ok: true, transport: 'poll' };
    return {
      ok: false,
      code: 'FILE_NOT_FOUND',
      error: `No connected Figma plugin matches "${file}". Candidates: ${describeCandidates() || '(none)'}.`,
    };
  }

  if (sockets.length === 1) return { ok: true, transport: 'ws', socket: sockets[0] };
  if (sockets.length > 1) {
    return {
      ok: false,
      code: 'FILE_REQUIRED',
      error: `Several Figma plugins are connected. Pass file with a fileName or sessionId. Candidates: ${describeCandidates()}.`,
    };
  }
  if (isPollingActive()) return { ok: true, transport: 'poll' };
  return {
    ok: false,
    code: 'NO_PLUGIN',
    error: 'No Figma plugin is connected. Open the plugin window in Figma Desktop and try again.',
  };
};

/** Move commands that were waiting for a poll into a newly connected socket. */
export const flushQueuedCommands = (socket: WebSocket): void => {
  const now = Date.now();
  const pending = editQueue.splice(0, editQueue.length);
  for (const command of pending) {
    if (cancelledIds.has(command.id)) continue;
    if (command.expiresAt !== undefined && command.expiresAt <= now) {
      rememberCancelled(command.id);
      continue;
    }
    if (!editWaiters.has(command.id)) continue;
    try {
      socket.send(JSON.stringify({ type: 'command', command }));
      commandTargets.set(command.id, socket);
    } catch {
      editQueue.push(command);
    }
  }
};

const removeFromQueue = (id: string): void => {
  const index = editQueue.findIndex((command) => command.id === id);
  if (index >= 0) editQueue.splice(index, 1);
};

export const executeEdit = (
  type: EditCommandType,
  payload: Record<string, unknown>,
  file?: string,
): Promise<EditResult> => {
  const target = selectPluginTarget(file);
  if (!target.ok) {
    return Promise.resolve({ ok: false, code: target.code, error: target.error });
  }

  const timeoutMs = Number(process.env.FIGMA_COMMAND_TIMEOUT_MS ?? 60_000);
  const command = {
    id: randomUUID(),
    type,
    payload,
    expiresAt: Date.now() + timeoutMs,
  } satisfies EditCommand;

  if (target.transport === 'poll') {
    editQueue.push(command);
  } else {
    commandTargets.set(command.id, target.socket);
  }

  return new Promise<EditResult>((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout;

    const settle = (result: EditResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      editWaiters.delete(command.id);
      commandTargets.delete(command.id);
      resolve(result);
    };

    timeout = setTimeout(() => {
      rememberCancelled(command.id);
      if (target.transport === 'poll') {
        removeFromQueue(command.id);
      } else if (target.socket.readyState === WebSocket.OPEN) {
        try {
          target.socket.send(JSON.stringify({ type: 'cancel', id: command.id }));
        } catch {
          // The socket is going away; the waiter is still dropped below.
        }
      }
      settle({ ok: false, code: 'TIMEOUT', error: 'Timed out waiting for the Figma plugin.' });
    }, timeoutMs);

    editWaiters.set(command.id, settle);

    if (target.transport === 'ws') {
      try {
        target.socket.send(JSON.stringify({ type: 'command', command }));
      } catch {
        settle({
          ok: false,
          code: 'PLUGIN_DISCONNECTED',
          error: 'The Figma plugin disconnected before the command could be sent.',
        });
      }
    }
  });
};
