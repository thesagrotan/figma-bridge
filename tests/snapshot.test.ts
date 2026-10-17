import { describe, expect, it } from 'vitest';
import { normalizeSnapshot } from '../src/parallel/snapshot.js';
import { findSnapshotNode } from '../src/parallel/snapshot.js';
import { rawCard, rawMixed, rawOpaque } from './fixtures.js';

describe('snapshot normalization', () => {
  it('normalizes a component tree into the PARALLEL contract', () => {
    const snapshot = normalizeSnapshot(rawCard(), new Date('2026-01-01T00:00:00Z'));

    expect(snapshot.root.id).toBe('1:100');
    expect(snapshot.nodeCount).toBe(3);
    expect(snapshot.context.pageName).toBe('Page 1');
    expect(snapshot.capturedAt).toBe('2026-01-01T00:00:00.000Z');

    const root = snapshot.root;
    expect(root.primaryFill?.hex).toBe('#ffffff');
    expect(root.cornerRadius).toBe(6);
    expect(root.layout.mode).toBe('VERTICAL');
    expect(root.layout.itemSpacing).toBe(14);
    expect(root.layout.padding).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    expect(root.capabilities.canAdjustSpacing).toBe(true);
    expect(root.capabilities.isComponentLike).toBe(true);

    const title = findSnapshotNode(root, '1:101');
    expect(title?.typography?.characters).toBe('Monthly revenue');
    expect(title?.typography?.lineHeightPx).toBe(18);
    expect(title?.capabilities.canRestyleTypography).toBe(true);
  });

  it('flags opaque geometry instead of guessing', () => {
    const snapshot = normalizeSnapshot(rawOpaque());
    expect(snapshot.root.capabilities.isOpaqueGeometry).toBe(true);
    expect(snapshot.root.capabilities.canRecolor).toBe(false);
    expect(snapshot.root.capabilities.canAdjustSpacing).toBe(false);
    expect(snapshot.warnings.join(' ')).toContain('opaque geometry');
  });

  it('survives missing properties, mixed values and malformed context', () => {
    const snapshot = normalizeSnapshot(rawMixed());
    expect(snapshot.root.cornerRadius).toBeNull();
    expect(snapshot.root.layout.itemSpacing).toBeNull();
    expect(snapshot.context.selectionIds).toEqual([]);
    expect(snapshot.root.children).toHaveLength(0);
    expect(snapshot.warnings.join(' ')).toContain('without an id');
  });

  it('throws a clear error when the plugin returns nothing', () => {
    expect(() => normalizeSnapshot(null)).toThrow(/empty/i);
  });
});
