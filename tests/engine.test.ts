import { describe, expect, it } from 'vitest';
import { generateVariations, validateChanges } from '../src/parallel/engine.js';
import { flattenSnapshot, normalizeSnapshot } from '../src/parallel/snapshot.js';
import { contrastRatio, hexToRgba } from '../src/parallel/color.js';
import { rawCard, rawOpaque } from './fixtures.js';

const snapshot = () => normalizeSnapshot(rawCard());

describe('variation engine', () => {
  it('produces exactly one direction per mode', () => {
    const variations = generateVariations(snapshot());
    expect(variations.map((v) => v.mode)).toEqual(['refine', 'reinterpret', 'mutate']);
    expect(variations.map((v) => v.id)).toEqual(['refine:1:100', 'reinterpret:1:100', 'mutate:1:100']);
  });

  it('is deterministic', () => {
    const a = generateVariations(snapshot());
    const b = generateVariations(snapshot());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces materially different change sets per mode', () => {
    const [refine, reinterpret, mutate] = generateVariations(snapshot());
    const key = (v: { changes: Array<{ kind: string; to?: unknown }> }) => JSON.stringify(v.changes);

    expect(refine.changes.length).toBeGreaterThan(0);
    expect(key(refine)).not.toBe(key(reinterpret));
    expect(key(reinterpret)).not.toBe(key(mutate));

    // Refine refines: it nudges spacing onto the 4pt grid and leaves colour alone.
    expect(refine.changes.some((c) => c.kind === 'itemSpacing' && c.to === 16)).toBe(true);
    expect(refine.changes.some((c) => c.kind === 'fill')).toBe(false);

    // Reinterpret swaps the surface language.
    expect(reinterpret.changes.some((c) => c.kind === 'fill')).toBe(true);

    // Mutate inverts the surface and keeps content legible.
    const fills = mutate.changes.filter((c) => c.kind === 'fill');
    expect(fills.length).toBeGreaterThanOrEqual(2);
    expect(mutate.challengedConstraints.length).toBeGreaterThan(0);
    expect(refine.challengedConstraints).toHaveLength(0);
  });

  it('keeps every text node readable after Mutate inverts the surface', () => {
    const snap = snapshot();
    const mutate = generateVariations(snap).find((v) => v.mode === 'mutate')!;
    const surface = mutate.changes.find((c) => c.kind === 'fill' && c.targetId === snap.root.id);
    expect(surface).toBeDefined();
    const inverted = hexToRgba(surface!.toHex!);

    const texts = flattenSnapshot(snap.root).filter((n) => n.typography !== null && n.id !== snap.root.id);
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) {
      const applied = mutate.changes.find((c) => c.kind === 'fill' && c.targetId === node.id);
      const foreground = applied ? hexToRgba(applied.toHex!) : node.primaryFill!.color;
      expect(contrastRatio(foreground, inverted)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('never emits a change the snapshot cannot support', () => {
    const variations = generateVariations(snapshot());
    for (const variation of variations) {
      const { valid, rejected } = validateChanges(snapshot(), variation.changes);
      expect(rejected).toHaveLength(0);
      expect(valid).toHaveLength(variation.changes.length);
    }
  });

  it('rejects unsupported transformations rather than producing invalid output', () => {
    const target = snapshot();
    const { valid, rejected } = validateChanges(target, [
      { kind: 'itemSpacing', targetId: '1:101', from: 0, to: 8 },
      { kind: 'cornerRadius', targetId: 'does-not-exist', from: 0, to: 8 },
    ]);
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toMatch(/auto-layout/i);
    expect(rejected[1].reason).toMatch(/not part of the snapshot/i);
  });

  it('returns empty directions for components it cannot safely change', () => {
    const variations = generateVariations(normalizeSnapshot(rawOpaque()));
    expect(variations).toHaveLength(3);
    expect(variations.every((v) => v.changeSummary.match(/no supported changes/i))).toBe(true);
  });

  it('describes every change in designer language', () => {
    for (const variation of generateVariations(snapshot())) {
      expect(variation.title.length).toBeGreaterThan(0);
      expect(variation.rationale.length).toBeGreaterThan(0);
      expect(variation.preservedConstraints.length).toBeGreaterThan(0);
    }
  });
});
