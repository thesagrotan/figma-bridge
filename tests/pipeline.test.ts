import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeState = vi.hoisted(() => ({ connected: true }));
vi.mock('../src/bridge/status.js', () => ({
  isPluginConnected: () => bridgeState.connected,
  isWebSocketConnected: () => bridgeState.connected,
  markPluginPoll: () => {},
}));

import { applyVariation, discardNode, explore } from '../src/parallel/pipeline.js';
import type { Dispatcher } from '../src/parallel/pipeline.js';
import type { EditCommandType, EditResult } from '../src/types/commands.js';
import { TINY_PNG_BASE64, rawCard, rawOpaque } from './fixtures.js';

const makeDispatcher = (overrides: Partial<Record<EditCommandType, EditResult>> = {}) => {
  const calls: Array<{ type: EditCommandType; payload: Record<string, unknown> }> = [];
  const dispatch: Dispatcher = vi.fn(async (type, payload) => {
    calls.push({ type, payload });
    if (overrides[type]) return overrides[type] as EditResult;
    switch (type) {
      case 'parallel_snapshot':
        return { ok: true, result: rawCard() };
      case 'export_node':
        return { ok: true, result: { base64: TINY_PNG_BASE64 } };
      case 'parallel_preview':
        return { ok: true, result: { base64: TINY_PNG_BASE64, width: 640, height: 360 } };
      case 'parallel_apply':
        return { ok: true, result: { createdNodeId: '9:9', createdNodeName: 'Revenue Card · refine', appliedKinds: ['itemSpacing'] } };
      case 'parallel_discard':
        return { ok: true, result: { removedNodeId: '9:9' } };
      default:
        return { ok: false, code: 'UNKNOWN', error: `unexpected ${type}` };
    }
  });
  return { dispatch, calls };
};

describe('pipeline', () => {
  beforeEach(() => {
    vi.useRealTimers();
    bridgeState.connected = true;
  });

  it('fails fast and helpfully when no plugin is connected', async () => {
    const { dispatch } = makeDispatcher();
    bridgeState.connected = false;
    await expect(explore(dispatch, {})).rejects.toThrow(/No Figma plugin is connected/i);
  });

  it('runs the full explore pass: snapshot, variations, original + previews', async () => {
    const { dispatch } = makeDispatcher();
    const result = await explore(dispatch, { scale: 2 });

    expect(result.snapshot.root.id).toBe('1:100');
    expect(result.variations).toHaveLength(3);
    expect(result.previews.originalBase64).toBe(TINY_PNG_BASE64);
    expect(result.previews.originalWidth).toBe(640);
    expect(result.previews.previews).toHaveLength(3);
    expect(result.previews.previews.every((p) => p.status === 'ready' && p.imageBase64)).toBe(true);
  });

  it('marks directions with no supported changes as empty instead of calling the plugin', async () => {
    const { dispatch, calls } = makeDispatcher({ parallel_snapshot: { ok: true, result: rawOpaque() } });
    const result = await explore(dispatch, {});

    expect(result.previews.previews.every((p) => p.status === 'empty')).toBe(true);
    expect(calls.some((c) => c.type === 'parallel_preview')).toBe(false);
  });

  it('surfaces a preview failure as an error state, not a crash', async () => {
    const { dispatch } = makeDispatcher({
      parallel_preview: { ok: false, code: 'TIMEOUT', error: 'plugin asleep' },
    });
    const result = await explore(dispatch, {});
    expect(result.previews.previews.every((p) => p.status === 'error')).toBe(true);
    expect(result.previews.previews[0].message).toMatch(/plugin asleep/);
  });

  it('refuses to apply without explicit approval', async () => {
    const { dispatch } = makeDispatcher();
    const result = await explore(dispatch, {});
    await expect(applyVariation(dispatch, { variationId: result.variations[0].id, approved: false })).rejects.toThrow(/approval/i);
  });

  it('refuses to apply a variation that has nothing to apply', async () => {
    const { dispatch } = makeDispatcher({ parallel_snapshot: { ok: true, result: rawOpaque() } });
    const result = await explore(dispatch, {});
    await expect(applyVariation(dispatch, { variationId: result.variations[0].id, approved: true })).rejects.toThrow(/nothing to apply/i);
  });

  it('refuses to apply an unknown or expired variation', async () => {
    const { dispatch } = makeDispatcher();
    await expect(applyVariation(dispatch, { variationId: 'mutate:9:9', approved: true })).rejects.toThrow(/unknown or expired/i);
  });

  it('applies the registered changes, ignoring anything a caller might inject', async () => {
    const { dispatch, calls } = makeDispatcher();
    const result = await explore(dispatch, {});
    const refine = result.variations.find((v) => v.mode === 'refine')!;

    const applied = await applyVariation(dispatch, { variationId: refine.id, approved: true });
    const applyCall = calls.find((c) => c.type === 'parallel_apply');

    expect(applied.success).toBe(true);
    expect(applied.createdNodeId).toBe('9:9');
    expect(applyCall?.payload.changes).toEqual(refine.changes);
    expect(applyCall?.payload.mode).toBe('refine');
  });

  it('reports a plugin-side apply failure without throwing', async () => {
    const { dispatch } = makeDispatcher({
      parallel_apply: { ok: false, code: 'LOCKED', error: 'parent is locked' },
    });
    const result = await explore(dispatch, {});
    const applied = await applyVariation(dispatch, { variationId: result.variations[0].id, approved: true });

    expect(applied.success).toBe(false);
    expect(applied.createdNodeId).toBeNull();
    expect(applied.error).toMatch(/parent is locked/);
  });

  it('discards a created node and reports failure clearly', async () => {
    const { dispatch } = makeDispatcher();
    await expect(discardNode(dispatch, '9:9')).resolves.toEqual({ createdNodeId: '9:9', discarded: true, error: null });

    const failing = makeDispatcher({ parallel_discard: { ok: false, code: 'NOT_FOUND', error: 'gone' } });
    const bad = await discardNode(failing.dispatch, '9:9');
    expect(bad.discarded).toBe(false);
    expect(bad.error).toMatch(/gone/);
  });
});
