import { describe, expect, it } from 'vitest';
import { RECIPES, applyRecipe, composeRecipes, generateVariations, validateChanges } from '../src/parallel/engine.js';
import { flattenSnapshot, normalizeSnapshot, findSnapshotNode } from '../src/parallel/snapshot.js';
import { contrastRatio, hexToRgba } from '../src/parallel/color.js';
import type { RawSnapshot } from '../src/parallel/snapshot.js';
import type { PropertyChange } from '../src/parallel/types.js';
import { rawCard } from './fixtures.js';

const snapshot = () => normalizeSnapshot(rawCard());

/** A navy panel holding translucent white text — invisible at 15% alpha. */
const rawTranslucent = (): RawSnapshot => ({
  root: {
    id: '6:1',
    name: 'Translucent',
    type: 'FRAME',
    width: 200,
    height: 100,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
    children: [
      {
        id: '6:2',
        name: 'Panel',
        type: 'FRAME',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        fills: [{ type: 'SOLID', color: { r: 0.06, g: 0.09, b: 0.16 }, opacity: 1 }],
        children: [
          {
            id: '6:3',
            name: 'Ghost label',
            type: 'TEXT',
            x: 8,
            y: 8,
            width: 120,
            height: 16,
            fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.15 }],
            characters: 'Ghost',
            fontSize: 13,
            fontName: { family: 'Inter', style: 'Regular' },
          },
        ],
      },
    ],
  },
  context: { pageName: 'Page 1' },
});

/** A stroke-only outline: has strokes, no solid fill. */
const rawStrokeOnly = (): RawSnapshot => ({
  root: {
    id: '7:1',
    name: 'Outline',
    type: 'FRAME',
    width: 100,
    height: 100,
    fills: [],
    strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }],
    strokeWeight: 1,
    children: [],
  },
  context: { pageName: 'Page 1' },
});

describe('recipe engine', () => {
  it('exposes a catalogue of named recipes with intent copy', () => {
    const ids = Object.keys(RECIPES);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    for (const recipe of Object.values(RECIPES)) {
      expect(recipe.label.length).toBeGreaterThan(0);
      expect(recipe.intent.length).toBeGreaterThan(0);
    }
  });

  it('de-duplicates composed recipes by (kind, targetId)', () => {
    const snap = snapshot();
    const { changes } = composeRecipes(snap, [
      { id: 'radius.language', params: { style: 'sharp' } },
      { id: 'radius.align' },
    ]);
    const keys = changes.map((c) => `${c.kind}:${c.targetId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('moves every radius target to the sharp language', () => {
    const snap = snapshot();
    const { changes } = applyRecipe(snap, { id: 'radius.language', params: { style: 'sharp' } });
    for (const change of changes) {
      if (change.kind === 'cornerRadius') expect(change.to).toBe(2);
    }
    expect(changes.length).toBeGreaterThan(0);
  });

  it('inverts surfaces and keeps every neutral text node at a crisp, readable extreme', () => {
    const snap = snapshot();
    const { changes } = applyRecipe(snap, { id: 'surface.invert' });
    const rootFill = changes.find((c) => c.kind === 'fill' && c.targetId === snap.root.id);
    expect(rootFill).toBeDefined();
    // White card inverts to black.
    expect(rootFill!.kind === 'fill' && rootFill!.toHex).toBe('#000000');

    const texts = flattenSnapshot(snap.root).filter((n) => n.typography !== null && n.id !== snap.root.id);
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) {
      const applied = changes.find((c) => c.kind === 'fill' && c.targetId === node.id);
      const foreground = applied && applied.kind === 'fill' ? hexToRgba(applied.toHex) : node.primaryFill!.color;
      expect(contrastRatio(foreground, { r: 0, g: 0, b: 0, a: 1 })).toBeGreaterThanOrEqual(4.5);
      // Neutral text snaps to pure white rather than a muddy grey.
      expect(foreground.r === 1 && foreground.g === 1 && foreground.b === 1).toBe(true);
    }
  });

  it('raises typographic contrast by pushing the largest and smallest sizes apart', () => {
    const snap = snapshot();
    const { changes } = applyRecipe(snap, { id: 'type.contrast', params: { factor: 1.3 } });
    const sizes = changes.filter((c) => c.kind === 'fontSize');
    expect(sizes.length).toBeGreaterThan(0);
    const grew = changes.some((c) => c.kind === 'fontSize' && c.to > c.from);
    expect(grew).toBe(true);
  });

  it('rejects an unknown recipe instead of guessing', () => {
    const snap = snapshot();
    const { changes, rejected } = applyRecipe(snap, { id: 'not.a.recipe' });
    expect(changes).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/unknown recipe/i);
  });

  it('fixes translucent text by compositing it, not by trusting raw alpha', () => {
    const snap = normalizeSnapshot(rawTranslucent());
    const { changes } = applyRecipe(snap, { id: 'contrast.readability' });
    const fix = changes.find((c) => c.kind === 'fill' && c.targetId === '6:3');
    expect(fix, 'translucent text should be corrected').toBeDefined();
    if (fix?.kind !== 'fill') throw new Error('expected a fill change');
    // The corrected colour must be opaque and clear 4.5:1 on the navy panel.
    expect(fix.to.a).toBe(1);
    expect(contrastRatio(fix.to, { r: 0.06, g: 0.09, b: 0.16, a: 1 })).toBeGreaterThanOrEqual(4.5);
  });

  it('inverts a mid-grey surface to a deliberate opposite rather than a no-op', () => {
    const gray: RawSnapshot = {
      root: {
        id: '8:1', name: 'Gray', type: 'FRAME', width: 100, height: 100,
        fills: [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 }, opacity: 1 }], children: [],
      },
      context: { pageName: 'Page 1' },
    };
    const { changes } = applyRecipe(normalizeSnapshot(gray), { id: 'surface.invert' });
    const fill = changes.find((c) => c.kind === 'fill' && c.targetId === '8:1');
    expect(fill?.kind === 'fill' && fill.toHex).not.toBe('#808080');
  });

  it('rejects a fill on a stroke-only node but allows a stroke recolour', () => {
    const snap = normalizeSnapshot(rawStrokeOnly());
    const fill: PropertyChange = { kind: 'fill', targetId: '7:1', fromHex: '#000000', toHex: '#ffffff', to: { r: 1, g: 1, b: 1, a: 1 } };
    const stroke: PropertyChange = { kind: 'strokeColor', targetId: '7:1', fromHex: '#000000', toHex: '#ffffff', to: { r: 1, g: 1, b: 1, a: 1 } };
    const result = validateChanges(snap, [fill, stroke]);
    expect(result.rejected.some((r) => r.change.kind === 'fill')).toBe(true);
    expect(result.valid.some((c) => c.kind === 'strokeColor')).toBe(true);
  });

  it('does not treat a small saturated accent chip as a surface', () => {
    const raw: RawSnapshot = {
      root: {
        id: '9:1', name: 'Card', type: 'FRAME', width: 320, height: 180,
        fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
        children: [
          {
            id: '9:2', name: 'Badge', type: 'FRAME', x: 8, y: 8, width: 44, height: 20,
            fills: [{ type: 'SOLID', color: { r: 0.9, g: 0.22, b: 0.21 }, opacity: 1 }],
            children: [
              {
                id: '9:3', name: 'Label', type: 'TEXT', x: 4, y: 4, width: 36, height: 12,
                fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
                characters: 'New', fontSize: 11, fontName: { family: 'Inter', style: 'Bold' },
              },
            ],
          },
        ],
      },
      context: { pageName: 'Page 1' },
    };
    const { changes } = applyRecipe(normalizeSnapshot(raw), { id: 'surface.tint', params: { tone: 'paper' } });
    expect(changes.some((c) => c.targetId === '9:2')).toBe(false);
    expect(changes.some((c) => c.targetId === '9:1')).toBe(true);
  });

  it('only ever emits changes the snapshot can support, for every direction', () => {
    const snap = snapshot();
    for (const variation of generateVariations(snap)) {
      for (const change of variation.changes) {
        const node = findSnapshotNode(snap.root, change.targetId);
        expect(node, `${change.kind} → ${change.targetId}`).not.toBeNull();
      }
      expect(variation.recipes?.length ?? 0).toBeGreaterThan(0);
      expect(variation.origin).toBe('rules');
    }
  });
});
