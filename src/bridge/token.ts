import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Constant-time-ish token comparison, shared by the HTTP and WebSocket paths.
 *
 * Folds the length difference into the accumulating diff and iterates over the
 * longer of the two strings, so a mismatch never short-circuits early and the
 * comparison time does not track the position of the first wrong character.
 */
export const tokensMatch = (provided: unknown, expected: string): boolean => {
  if (typeof provided !== 'string') return false;
  let diff = provided.length ^ expected.length;
  const max = Math.max(provided.length, expected.length);
  for (let i = 0; i < max; i++) {
    diff |= (provided.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
};

export const defaultTokenPath = (): string => join(homedir(), '.figma-bridge', 'token');

export type ResolvedToken = {
  token: string;
  path: string | null;
  created: boolean;
};

/**
 * Resolve the bridge token without ever falling back to a shared default.
 *
 * - `FIGMA_BRIDGE_TOKEN` wins when set and non-empty.
 * - Otherwise the token is read from the token file.
 * - If the file is missing, a random 32-byte token is generated, persisted with
 *   mode 0600 and its path returned so the caller can log the path only.
 */
export const loadOrCreateBridgeToken = (tokenPath = defaultTokenPath()): ResolvedToken => {
  const envToken = process.env.FIGMA_BRIDGE_TOKEN?.trim();
  if (envToken) return { token: envToken, path: null, created: false };

  if (existsSync(tokenPath)) {
    const saved = readFileSync(tokenPath, 'utf8').trim();
    if (saved) return { token: saved, path: tokenPath, created: false };
  }

  const token = randomBytes(32).toString('hex');
  mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(tokenPath, `${token}\n`, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    // Another process created it first; use that token rather than racing.
    const saved = readFileSync(tokenPath, 'utf8').trim();
    if (saved) return { token: saved, path: tokenPath, created: false };
    throw error;
  }
  chmodSync(tokenPath, 0o600);
  return { token, path: tokenPath, created: true };
};
