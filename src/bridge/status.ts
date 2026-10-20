import { WebSocket } from 'ws';

export type PluginSession = {
  sessionId: string | null;
  fileName: string | null;
  pageName: string | null;
  connectedAt: number;
};

export type PluginCandidate = Pick<PluginSession, 'sessionId' | 'fileName' | 'pageName'>;

/**
 * Tracks every connected plugin window.
 *
 * WebSocket is the fast path. The HTTP polling fallback has no identity, only
 * liveness, so it is represented as a single anonymous session.
 */
const plugins = new Map<WebSocket, PluginSession>();

const POLL_ACTIVE_MS = 5_000;
let lastPollAt = 0;

export const registerPlugin = (socket: WebSocket): void => {
  plugins.set(socket, { sessionId: null, fileName: null, pageName: null, connectedAt: Date.now() });
};

export const updatePluginSession = (
  socket: WebSocket,
  session: { sessionId?: unknown; fileName?: unknown; pageName?: unknown },
): void => {
  const current = plugins.get(socket);
  if (!current) return;
  plugins.set(socket, {
    ...current,
    sessionId: typeof session.sessionId === 'string' ? session.sessionId : current.sessionId,
    fileName: typeof session.fileName === 'string' ? session.fileName : current.fileName,
    pageName: typeof session.pageName === 'string' ? session.pageName : current.pageName,
  });
};

export const unregisterPlugin = (socket: WebSocket): void => {
  plugins.delete(socket);
};

export const getPluginSession = (socket: WebSocket): PluginSession | undefined => plugins.get(socket);

export const openPlugins = (): WebSocket[] =>
  [...plugins.keys()].filter((socket) => socket.readyState === WebSocket.OPEN);

export const listPluginCandidates = (): PluginCandidate[] =>
  openPlugins().map((socket) => {
    const session = plugins.get(socket);
    return {
      sessionId: session?.sessionId ?? null,
      fileName: session?.fileName ?? null,
      pageName: session?.pageName ?? null,
    };
  });

export const markPluginPoll = (): void => {
  lastPollAt = Date.now();
};

export const isPollingActive = (): boolean => Date.now() - lastPollAt < POLL_ACTIVE_MS;

export const isPluginConnected = (): boolean => openPlugins().length > 0 || isPollingActive();
