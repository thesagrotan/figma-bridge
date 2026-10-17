import type { RawSnapshot } from '../src/parallel/snapshot.js';
import { normalizeSnapshot } from '../src/parallel/snapshot.js';

/** A dashboard card: light surface, heading text, dark inner panel. */
export const rawCard = (): RawSnapshot => ({
  root: {
    id: '1:100',
    name: 'Revenue Card',
    type: 'COMPONENT',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    visible: true,
    opacity: 1,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 6,
    layoutMode: 'VERTICAL',
    itemSpacing: 14,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 16,
    paddingBottom: 16,
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    layoutSizingHorizontal: 'FIXED',
    layoutSizingVertical: 'HUG',
    children: [
      {
        id: '1:101',
        name: 'Title',
        type: 'TEXT',
        x: 16,
        y: 16,
        width: 120,
        height: 18,
        visible: true,
        opacity: 1,
        fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 }, opacity: 1 }],
        characters: 'Monthly revenue',
        fontSize: 13,
        fontName: { family: 'Inter', style: 'Regular' },
        lineHeight: { unit: 'PIXELS', value: 18 },
        letterSpacing: { unit: 'PIXELS', value: 0 },
        textAlignHorizontal: 'LEFT',
      },
      {
        id: '1:102',
        name: 'Panel',
        type: 'FRAME',
        x: 16,
        y: 46,
        width: 288,
        height: 118,
        visible: true,
        opacity: 1,
        fills: [{ type: 'SOLID', color: { r: 0.11, g: 0.12, b: 0.16 }, opacity: 1 }],
        cornerRadius: 6,
        layoutMode: 'NONE',
        children: [],
      },
    ],
  },
  context: { fileName: 'Test File', pageName: 'Page 1', selectionIds: ['1:100'] },
});

/** A component with nothing PARALLEL can safely change. */
export const rawOpaque = (): RawSnapshot => ({
  root: {
    id: '2:1',
    name: 'Vector Logo',
    type: 'VECTOR',
    width: 48,
    height: 48,
    fills: [],
    strokes: [],
    children: [],
  },
  context: { pageName: 'Icons' },
});

/** Raw tree containing unreadable (mixed) values the plugin collapsed. */
export const rawMixed = (): RawSnapshot => ({
  root: {
    id: '3:1',
    name: 'Mixed',
    type: 'FRAME',
    width: 100,
    height: 100,
    fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.5 }],
    cornerRadius: undefined,
    itemSpacing: undefined,
    layoutMode: 'HORIZONTAL',
    children: [{ name: 'no id' }],
  },
  context: { pageName: 'Page 2', selectionIds: 'not-an-array' },
});

export const snapshotOf = (raw: RawSnapshot) => normalizeSnapshot(raw, new Date('2026-01-01T00:00:00.000Z'));

/** 1x1 transparent PNG, enough to prove the preview pipeline moves bytes. */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
