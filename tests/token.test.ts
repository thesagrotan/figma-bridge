import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOrCreateBridgeToken } from '../src/bridge/token.js';

const dirs: string[] = [];

const tempTokenPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'figma-mcp-unchained-token-'));
  dirs.push(dir);
  return join(dir, 'nested', 'token');
};

afterEach(() => {
  delete process.env.FIGMA_MCP_UNCHAINED_TOKEN;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('bridge token resolution', () => {
  it('generates a random 32-byte token on first start and persists it 0600', () => {
    const path = tempTokenPath();
    const first = loadOrCreateBridgeToken(path);

    expect(first.created).toBe(true);
    expect(first.path).toBe(path);
    expect(first.token).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(path, 'utf8').trim()).toBe(first.token);
    expect(statSync(path).mode & 0o777).toBe(0o600);

    const second = loadOrCreateBridgeToken(path);
    expect(second.created).toBe(false);
    expect(second.token).toBe(first.token);
    expect(second.path).toBe(path);
  });

  it('uses FIGMA_MCP_UNCHAINED_TOKEN when set and writes no file', () => {
    process.env.FIGMA_MCP_UNCHAINED_TOKEN = 'an-explicit-token';
    const path = tempTokenPath();
    const resolved = loadOrCreateBridgeToken(path);

    expect(resolved).toEqual({ token: 'an-explicit-token', path: null, created: false });
    expect(() => statSync(path)).toThrow();
  });

  it('trims and ignores an empty environment token', () => {
    process.env.FIGMA_MCP_UNCHAINED_TOKEN = '   ';
    const path = tempTokenPath();
    const resolved = loadOrCreateBridgeToken(path);
    expect(resolved.created).toBe(true);
    expect(resolved.path).toBe(path);
  });
});
