import { WebSocket } from 'ws';
import { wsClients } from './queue.js';

/**
 * Whether a Figma plugin is reachable, over either transport.
 *
 * - WebSocket: a socket is open (the fast path).
 * - HTTP fallback: a plugin polled `/commands` recently. The window is generous
 *   enough to survive one missed poll but short enough to fail fast.
 */
const POLL_ACTIVE_MS = 5_000;
let lastPollAt = 0;

export const markPluginPoll = (): void => {
  lastPollAt = Date.now();
};

export const isWebSocketConnected = (): boolean =>
  [...wsClients].some((socket) => socket.readyState === WebSocket.OPEN);

export const isPluginConnected = (): boolean => isWebSocketConnected() || Date.now() - lastPollAt < POLL_ACTIVE_MS;
