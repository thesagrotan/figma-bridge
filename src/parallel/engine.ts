import type { ComponentSnapshot, ComponentSnapshotNode, PropertyChange, Rgba, Variation, VariationMode } from './types.js';
import { findSnapshotNode, flattenSnapshot } from './snapshot.js';
import {
  compositeOver,
  contrastRatio,
  darken,
  ensureReadable,
  hexToRgba,
  invertRgba,
  isDark,
  isNearGrey,
  lighten,
  luminance,
  mixRgba,
  readableOn,
  rgbaToHex,
  rotateHue,
  saturate,
  saturation,
} from './color.js';

/**
 * PARALLEL variation engine.
 *
 * Pure functions only: the engine reads a ComponentSnapshot and returns
 * validated, property-level changes. It never touches the Figma document, so it
 * can be exercised entirely from fixtures.
 *
 * The engine is built from named **recipes** — small, capability-aware builders
 * that each express one clear design idea (tighten the grid, shift the radius
 * language, invert the surface, raise typographic contrast...). A direction
 * (Refine / Reinterpret / Mutate) is a *composition* of recipes. A written
 * design brief maps principles onto the same recipes, so reference-guided
 * exploration reuses this engine instead of a parallel one.
 */

// ---------------------------------------------------------------------------
// Small numeric / tree helpers
// ---------------------------------------------------------------------------

const snapToGrid = (value: number, grid: number): number => Math.round(value / grid) * grid;

const nearestStep = (value: number, step: number): number => Math.round(value / step) * step;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const area = (node: ComponentSnapshotNode): number => Math.max(0, node.width) * Math.max(0, node.height);

const rootArea = (snapshot: ComponentSnapshot): number => Math.max(1, area(snapshot.root));

const fillChange = (node: ComponentSnapshotNode, to: Rgba): PropertyChange | null => {
  if (!node.primaryFill || !node.capabilities.canRecolor) return null;
  return { kind: 'fill', targetId: node.id, fromHex: rgbaToHex(node.primaryFill.color), toHex: rgbaToHex(to), to };
};

const dominantSurface = (snapshot: ComponentSnapshot): ComponentSnapshotNode | null => {
  const candidates = flattenSnapshot(snapshot.root).filter((n) => n.primaryFill && n.capabilities.canRecolor && !n.capabilities.isText);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, node) => (area(node) > area(best) ? node : best));
};

const radiusTargets = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  flattenSnapshot(snapshot.root).filter((n) => n.capabilities.canAdjustRadius && typeof n.cornerRadius === 'number');

const spacingTargets = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  flattenSnapshot(snapshot.root).filter((n) => n.capabilities.canAdjustSpacing && n.layout.itemSpacing !== null);

const paddingTargets = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  flattenSnapshot(snapshot.root).filter((n) => n.capabilities.canAdjustSpacing && n.layout.padding !== null);

const textTargets = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  flattenSnapshot(snapshot.root).filter((n) => n.capabilities.canRestyleTypography && n.typography !== null);

/** Text nodes ordered by font size, largest last. */
const textBySize = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  [...textTargets(snapshot)].sort((a, b) => (a.typography?.fontSize ?? 0) - (b.typography?.fontSize ?? 0));

/**
 * Whether a node reads as a *surface* — the thing other content sits on —
 * rather than content or an accent. Surfaces are what a language shift should
 * touch: the card, a nested panel. Saturated accents (bars, badges) are left
 * alone so a tint or an inversion reads as a designed system, not a filter.
 */
const isSurfaceNode = (snapshot: ComponentSnapshot, node: ComponentSnapshotNode): boolean => {
  if (!node.primaryFill || !node.capabilities.canRecolor) return false;
  if (node.capabilities.isText) return false;
  const color = node.primaryFill.color;
  const large = area(node) >= 0.12 * rootArea(snapshot);
  // A small, saturated container is an accent chip (a badge, a tag), not a
  // surface. It keeps its colour so a tint or an inversion reads as a designed
  // system rather than a filter over every colour in the component.
  if (saturation(color) > 0.5 && !large) return false;
  if (node.children.length > 0) return true;
  if (large) return true;
  return saturation(color) < 0.3;
};

const surfaces = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  flattenSnapshot(snapshot.root).filter((n) => isSurfaceNode(snapshot, n));

/** The nearest *ancestor* carrying a solid fill — the surface text actually sits on. */
const nearestBackground = (root: ComponentSnapshotNode, targetId: string): ComponentSnapshotNode | null => {
  let found: ComponentSnapshotNode | null = null;
  const visit = (node: ComponentSnapshotNode, background: ComponentSnapshotNode | null): boolean => {
    if (node.id === targetId) {
      found = background;
      return true;
    }
    const next = node.primaryFill ? node : background;
    return node.children.some((child) => visit(child, next));
  };
  visit(root, null);
  return found;
};

/**
 * After surfaces are recoloured, fix any text that would fall below 4.5:1
 * against the surface it actually sits on. `newFill` carries the intended new
 * colours so nested panels are judged against their own new tone, not the root.
 */
const legibilityPass = (snapshot: ComponentSnapshot, newFill: Map<string, Rgba>, crisp = false): PropertyChange[] => {
  const changes: PropertyChange[] = [];
  const fallback = snapshot.root.primaryFill?.color ?? { r: 1, g: 1, b: 1, a: 1 };
  for (const node of textTargets(snapshot)) {
    const bgNode = nearestBackground(snapshot.root, node.id);
    const bg = bgNode ? newFill.get(bgNode.id) ?? bgNode.primaryFill?.color ?? fallback : fallback;
    const current = node.primaryFill?.color ?? readableOn(bg);
    // Measure what the eye sees: translucent text is composited over its surface.
    if (contrastRatio(compositeOver(current, bg), bg) >= 4.5) continue;
    // When a surface has actually changed (invert / re-tone), neutral text snaps
    // to the crisp extreme — white on dark, black on light — because a
    // hue-preserving nudge stops at the minimum passable grey and reads as muddy.
    // A plain readability fix (Refine) stays gentle and keeps the text's tone.
    const snap = crisp && saturation(current) < 0.35;
    const fixed = snap ? readableOn(bg) : ensureReadable(current, bg);
    const change = fillChange(node, fixed);
    if (change) changes.push(change);
  }
  return changes;
};

// ---------------------------------------------------------------------------
// Recipe system
// ---------------------------------------------------------------------------

export type RecipeParams = Record<string, number | string>;

export type Recipe = {
  id: string;
  /** Designer-facing name of the idea. */
  label: string;
  /** One line on what it does and why. */
  intent: string;
  /** Constraints the recipe deliberately pushes against. */
  challenges: string[];
  build: (snapshot: ComponentSnapshot, params: RecipeParams) => PropertyChange[];
};

export type RecipeSpec = { id: string; params?: RecipeParams };

const TRACKING: Record<string, number> = { tight: -0.3, normal: 0, loose: 0.5, wide: 1.4 };

const RADIUS_STYLES: Record<string, number> = { sharp: 2, soft: 8, round: 16, pill: -1 };

const TINTS: Record<string, { light: Rgba; dark: Rgba; label: string }> = {
  paper: { light: hexToRgba('#fbf0d8'), dark: hexToRgba('#2b2320'), label: 'warm paper' },
  indigo: { light: hexToRgba('#eceefe'), dark: hexToRgba('#161a30'), label: 'deep indigo' },
  cool: { light: hexToRgba('#eef5f7'), dark: hexToRgba('#131c20'), label: 'cool slate' },
  warm: { light: hexToRgba('#fdeee2'), dark: hexToRgba('#241812'), label: 'warm clay' },
};

const buildRhythmGrid = (snapshot: ComponentSnapshot): PropertyChange[] => {
  const changes: PropertyChange[] = [];
  for (const node of spacingTargets(snapshot)) {
    const spacing = node.layout.itemSpacing as number;
    if (spacing <= 0) continue;
    const snapped = snapToGrid(spacing, 4);
    if (snapped !== spacing) changes.push({ kind: 'itemSpacing', targetId: node.id, from: spacing, to: snapped });
  }
  return changes;
};

const buildRadiusAlign = (snapshot: ComponentSnapshot): PropertyChange[] => {
  const changes: PropertyChange[] = [];
  for (const node of radiusTargets(snapshot)) {
    const radius = node.cornerRadius as number;
    if (radius === 0) continue;
    const snapped = nearestStep(radius, 4);
    if (Math.abs(snapped - radius) >= 2 && snapped >= 0) {
      changes.push({ kind: 'cornerRadius', targetId: node.id, from: radius, to: snapped });
    }
  }
  return changes;
};

const buildRadiusLanguage = (snapshot: ComponentSnapshot, params: RecipeParams): PropertyChange[] => {
  const style = String(params.style ?? 'soft');
  const base = RADIUS_STYLES[style] ?? RADIUS_STYLES.soft;
  const changes: PropertyChange[] = [];
  for (const node of radiusTargets(snapshot)) {
    const radius = node.cornerRadius as number;
    const target = base === -1 ? Math.round(Math.min(node.width, node.height) / 2) : base;
    // A node already at or below the sharp target is already sharp — nudging
    // 0 → 2 is noise, not a language change.
    if (base <= 2 && radius <= target) continue;
    if (target !== radius) changes.push({ kind: 'cornerRadius', targetId: node.id, from: radius, to: target });
  }
  return changes;
};

const buildTypeContrast = (snapshot: ComponentSnapshot, params: RecipeParams): PropertyChange[] => {
  const factor = typeof params.factor === 'number' ? params.factor : 1.15;
  const texts = textBySize(snapshot);
  if (texts.length === 0) return [];
  const changes: PropertyChange[] = [];

  const largest = texts[texts.length - 1];
  const bigFrom = largest.typography?.fontSize ?? 0;
  const bigTo = clamp(Math.round(bigFrom * factor), 8, 160);
  if (bigTo !== bigFrom) changes.push({ kind: 'fontSize', targetId: largest.id, from: bigFrom, to: bigTo });

  const smallest = texts[0];
  if (smallest.id !== largest.id) {
    const smallFrom = smallest.typography?.fontSize ?? 0;
    const smallTo = clamp(Math.round(smallFrom / factor), 8, 160);
    if (smallTo !== smallFrom) changes.push({ kind: 'fontSize', targetId: smallest.id, from: smallFrom, to: smallTo });
  }
  return changes;
};

const buildTypeTracking = (snapshot: ComponentSnapshot, params: RecipeParams): PropertyChange[] => {
  const texts = textBySize(snapshot);
  if (texts.length === 0) return [];
  const hero = TRACKING[String(params.hero ?? 'tight')] ?? 0;
  const label = TRACKING[String(params.label ?? 'wide')] ?? 0.4;
  const changes: PropertyChange[] = [];

  const largest = texts[texts.length - 1];
  const heroFrom = largest.typography?.letterSpacing ?? null;
  if (heroFrom !== hero) changes.push({ kind: 'letterSpacing', targetId: largest.id, from: heroFrom, to: hero });

  const smallest = texts[0];
  if (smallest.id !== largest.id) {
    const labelFrom = smallest.typography?.letterSpacing ?? null;
    if (labelFrom !== label) changes.push({ kind: 'letterSpacing', targetId: smallest.id, from: labelFrom, to: label });
  }
  return changes;
};

const buildDensity = (snapshot: ComponentSnapshot, params: RecipeParams): PropertyChange[] => {
  const factor = typeof params.factor === 'number' ? params.factor : 1.2;
  const changes: PropertyChange[] = [];
  for (const node of spacingTargets(snapshot)) {
    const from = node.layout.itemSpacing as number;
    const to = clamp(snapToGrid(from * factor, 4), 0, 160);
    if (to !== from) changes.push({ kind: 'itemSpacing', targetId: node.id, from, to });
  }
  for (const node of paddingTargets(snapshot)) {
    const from = node.layout.padding;
    if (!from) continue;
    const to = {
      top: snapToGrid(from.top * factor, 4),
      right: snapToGrid(from.right * factor, 4),
      bottom: snapToGrid(from.bottom * factor, 4),
      left: snapToGrid(from.left * factor, 4),
    };
    if (to.top !== from.top || to.right !== from.right || to.bottom !== from.bottom || to.left !== from.left) {
      changes.push({ kind: 'padding', targetId: node.id, from, to });
    }
  }
  return changes;
};

const buildTint = (snapshot: ComponentSnapshot, params: RecipeParams): PropertyChange[] => {
  const tone = TINTS[String(params.tone ?? 'paper')] ?? TINTS.paper;
  const changes: PropertyChange[] = [];
  const newFill = new Map<string, Rgba>();
  for (const node of surfaces(snapshot)) {
    const base = node.primaryFill!.color;
    const target = isDark(base) ? tone.dark : tone.light;
    const blended = { ...mixRgba(target, base, 0.12), a: base.a };
    newFill.set(node.id, blended);
    const change = fillChange(node, blended);
    if (change) changes.push(change);
  }
  changes.push(...legibilityPass(snapshot, newFill, true));
  return changes;
};

/** Inverts a surface. A mid-grey inverts to itself, so it gets a deliberate opposite instead. */
const invertSurface = (base: Rgba): Rgba => {
  const inverted = invertRgba(base);
  if (isNearGrey(base) && Math.abs(luminance(inverted) - luminance(base)) < 0.05) {
    return luminance(base) >= 0.5 ? { r: 0.09, g: 0.09, b: 0.1, a: base.a } : { r: 0.95, g: 0.95, b: 0.95, a: base.a };
  }
  return inverted;
};

const buildInvert = (snapshot: ComponentSnapshot): PropertyChange[] => {
  const changes: PropertyChange[] = [];
  const newFill = new Map<string, Rgba>();
  for (const node of surfaces(snapshot)) {
    const base = node.primaryFill!.color;
    const inverted = invertSurface(base);
    newFill.set(node.id, inverted);
    const change = fillChange(node, inverted);
    if (change) changes.push(change);
  }
  changes.push(...legibilityPass(snapshot, newFill, true));
  return changes;
};

const buildMonochrome = (snapshot: ComponentSnapshot, params: RecipeParams): PropertyChange[] => {
  const keepAccents = params.accents === 'keep';
  const changes: PropertyChange[] = [];
  const newFill = new Map<string, Rgba>();
  for (const node of surfaces(snapshot)) {
    const base = node.primaryFill!.color;
    const grey = saturate(base, 0);
    newFill.set(node.id, grey);
    const change = fillChange(node, grey);
    if (change) changes.push(change);
  }
  if (!keepAccents) {
    for (const node of flattenSnapshot(snapshot.root)) {
      if (!node.primaryFill || !node.capabilities.canRecolor || node.capabilities.isText) continue;
      if (newFill.has(node.id)) continue;
      const change = fillChange(node, saturate(node.primaryFill.color, 0));
      if (change) changes.push(change);
    }
  }
  changes.push(...legibilityPass(snapshot, newFill, true));
  return changes;
};

const buildBorder = (snapshot: ComponentSnapshot, params: RecipeParams): PropertyChange[] => {
  const surface = dominantSurface(snapshot);
  if (!surface) return [];
  const weight = typeof params.weight === 'number' ? params.weight : 1;
  const base = surface.primaryFill!.color;
  const line = isDark(base) ? lighten(base, 0.24) : darken(base, 0.16);
  return [
    { kind: 'strokeColor', targetId: surface.id, fromHex: surface.strokes[0]?.hex ?? null, toHex: rgbaToHex(line), to: line },
    { kind: 'strokeWeight', targetId: surface.id, from: surface.strokeWeight, to: weight },
  ];
};

const buildReadability = (snapshot: ComponentSnapshot): PropertyChange[] => legibilityPass(snapshot, new Map());

const buildHueShift = (snapshot: ComponentSnapshot, params: RecipeParams): PropertyChange[] => {
  const degrees = typeof params.degrees === 'number' ? params.degrees : 34;
  const surface = dominantSurface(snapshot);
  if (!surface) return [];
  const base = surface.primaryFill!.color;
  const shifted = isNearGrey(base)
    ? isDark(base)
      ? { r: 0.19, g: 0.21, b: 0.33, a: base.a }
      : { r: 0.99, g: 0.94, b: 0.83, a: base.a }
    : { ...saturate(rotateHue(base, degrees), 1.15), a: base.a };
  const change = fillChange(surface, shifted);
  return change ? [change] : [];
};

export const RECIPES: Record<string, Recipe> = {
  'rhythm.grid': {
    id: 'rhythm.grid',
    label: 'Snap spacing to the grid',
    intent: 'Move auto-layout spacing onto the 4pt grid so the rhythm reads as intentional.',
    challenges: [],
    build: (snapshot) => buildRhythmGrid(snapshot),
  },
  'radius.align': {
    id: 'radius.align',
    label: 'Align corner radii',
    intent: 'Settle every radius on the 4pt scale so corners are consistent, not accidents.',
    challenges: [],
    build: (snapshot) => buildRadiusAlign(snapshot),
  },
  'radius.language': {
    id: 'radius.language',
    label: 'Shift the corner language',
    intent: 'Move the whole component to one corner language — sharp, soft, round or pill.',
    challenges: ['corner language'],
    build: (snapshot, params) => buildRadiusLanguage(snapshot, params),
  },
  'type.contrast': {
    id: 'type.contrast',
    label: 'Raise typographic contrast',
    intent: 'Push the largest and smallest text apart so hierarchy is legible at a glance.',
    challenges: ['typographic scale'],
    build: (snapshot, params) => buildTypeContrast(snapshot, params),
  },
  'type.tracking': {
    id: 'type.tracking',
    label: 'Re-track the type',
    intent: 'Tighten display type and open up labels — an editorial tracking move.',
    challenges: ['typographic density'],
    build: (snapshot, params) => buildTypeTracking(snapshot, params),
  },
  'density.scale': {
    id: 'density.scale',
    label: 'Re-space the layout',
    intent: 'Scale spacing and padding together to shift the density of the whole component.',
    challenges: ['density and rhythm'],
    build: (snapshot, params) => buildDensity(snapshot, params),
  },
  'surface.tint': {
    id: 'surface.tint',
    label: 'Re-tone the surfaces',
    intent: 'Move every surface into one tonal family, harmonising nested panels with the card.',
    challenges: ['surface treatment', 'palette'],
    build: (snapshot, params) => buildTint(snapshot, params),
  },
  'surface.invert': {
    id: 'surface.invert',
    label: 'Invert the surfaces',
    intent: 'Flip surfaces to their tonal opposite and re-balance every text node to stay readable.',
    challenges: ['surface colour dominance'],
    build: (snapshot) => buildInvert(snapshot),
  },
  'surface.monochrome': {
    id: 'surface.monochrome',
    label: 'Quiet the palette',
    intent: 'Drain saturation so structure and hierarchy carry the design instead of colour.',
    challenges: ['palette'],
    build: (snapshot, params) => buildMonochrome(snapshot, params),
  },
  'emphasis.border': {
    id: 'emphasis.border',
    label: 'Border the surface',
    intent: 'Add a hairline border so the surface reads as a deliberate, technical object.',
    challenges: ['surface treatment'],
    build: (snapshot, params) => buildBorder(snapshot, params),
  },
  'surface.hue': {
    id: 'surface.hue',
    label: 'Rotate the accent hue',
    intent: 'Rotate the surface hue for a different voice while keeping the layout intact.',
    challenges: ['accent hue'],
    build: (snapshot, params) => buildHueShift(snapshot, params),
  },
  'contrast.readability': {
    id: 'contrast.readability',
    label: 'Fix readability',
    intent: 'Bring any text below 4.5:1 back to readable contrast against its own surface.',
    challenges: [],
    build: (snapshot) => buildReadability(snapshot),
  },
};

export const RECIPE_IDS = Object.keys(RECIPES);

/** Builds and validates a single recipe against a snapshot. */
export const applyRecipe = (
  snapshot: ComponentSnapshot,
  spec: RecipeSpec,
): { changes: PropertyChange[]; rejected: Array<{ change: PropertyChange; reason: string }> } => {
  const recipe = RECIPES[spec.id];
  if (!recipe) {
    return { changes: [], rejected: [{ change: { kind: 'opacity', targetId: spec.id, from: 1, to: 1 }, reason: `Unknown recipe "${spec.id}".` }] };
  }
  const proposed = recipe.build(snapshot, spec.params ?? {});
  const { valid, rejected } = validateChanges(snapshot, proposed);
  return { changes: valid, rejected };
};

/**
 * Runs recipes in order and de-duplicates by (kind, targetId). Later recipes
 * cannot silently override an earlier one, so composition stays predictable:
 * language recipes run first, corrective recipes last.
 */
export const composeRecipes = (
  snapshot: ComponentSnapshot,
  specs: RecipeSpec[],
): { changes: PropertyChange[]; rejected: Array<{ change: PropertyChange; reason: string }>; used: string[] } => {
  const seen = new Set<string>();
  const changes: PropertyChange[] = [];
  const rejected: Array<{ change: PropertyChange; reason: string }> = [];
  const used: string[] = [];

  for (const spec of specs) {
    if (!RECIPES[spec.id]) {
      rejected.push({ change: { kind: 'opacity', targetId: spec.id, from: 1, to: 1 }, reason: `Unknown recipe "${spec.id}".` });
      continue;
    }
    used.push(spec.id);
    const result = applyRecipe(snapshot, spec);
    rejected.push(...result.rejected);
    for (const change of result.changes) {
      const key = `${change.kind}:${change.targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changes.push(change);
    }
  }
  return { changes, rejected, used };
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationResult = { valid: PropertyChange[]; rejected: Array<{ change: PropertyChange; reason: string }> };

/** Rejects any change targeting a missing node or an unsupported capability. */
export const validateChanges = (snapshot: ComponentSnapshot, changes: PropertyChange[]): ValidationResult => {
  const valid: PropertyChange[] = [];
  const rejected: Array<{ change: PropertyChange; reason: string }> = [];

  for (const change of changes) {
    const node = findSnapshotNode(snapshot.root, change.targetId);
    if (!node) {
      rejected.push({ change, reason: `Target node ${change.targetId} is not part of the snapshot.` });
      continue;
    }
    const unsupported = ((): string | null => {
      switch (change.kind) {
        case 'fill':
          // A fill needs an actual solid paint to rewrite; stroke-only nodes must not pass.
          return node.capabilities.canRecolor ? null : 'Node has no solid paint to recolour.';
        case 'strokeColor':
          return node.capabilities.canRecolor || node.strokes.length > 0 || node.strokeWeight !== null ? null : 'Node has no stroke to recolour.';
        case 'cornerRadius':
          return node.capabilities.canAdjustRadius ? null : 'Node does not support corner radius.';
        case 'strokeWeight':
          return node.strokes.length > 0 || node.strokeWeight !== null ? null : 'Node has no stroke.';
        case 'itemSpacing':
        case 'padding':
          return node.capabilities.canAdjustSpacing ? null : 'Node is not an auto-layout frame.';
        case 'fontSize':
        case 'fontStyle':
        case 'letterSpacing':
          return node.capabilities.canRestyleTypography ? null : 'Node is not a text node.';
        case 'opacity':
          return null;
        default:
          return 'Unknown change kind.';
      }
    })();

    if (unsupported) rejected.push({ change, reason: unsupported });
    else valid.push(change);
  }

  return { valid, rejected };
};

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

export const describeChange = (change: PropertyChange): string => {
  switch (change.kind) {
    case 'fill':
      return `recolour ${change.targetId} ${change.fromHex} → ${change.toHex}`;
    case 'cornerRadius':
      return `corner radius ${change.from ?? 'auto'} → ${change.to}`;
    case 'strokeWeight':
      return `stroke weight ${change.from ?? '—'} → ${change.to}`;
    case 'strokeColor':
      return `stroke colour ${change.fromHex ?? '—'} → ${change.toHex}`;
    case 'itemSpacing':
      return `spacing ${change.from ?? '—'} → ${change.to}`;
    case 'padding':
      return `padding → ${change.to.top}/${change.to.right}/${change.to.bottom}/${change.to.left}`;
    case 'fontSize':
      return `font size ${change.from} → ${change.to}`;
    case 'fontStyle':
      return `weight ${change.from} → ${change.to}`;
    case 'letterSpacing':
      return `tracking ${change.from ?? '—'} → ${change.to}`;
    case 'opacity':
      return `opacity ${change.from} → ${change.to}`;
    default:
      return 'change';
  }
};

const describe = (changes: PropertyChange[]): string => {
  if (changes.length === 0) return 'No supported changes for this component.';
  return changes.map(describeChange).join('; ');
};

// ---------------------------------------------------------------------------
// Directions
// ---------------------------------------------------------------------------

type Direction = {
  mode: VariationMode;
  title: string;
  rationale: string;
  recipes: RecipeSpec[];
  preserved: string[];
  /**
   * Refine is conservative by definition: it polishes within the component's
   * own system, so it declares no challenges even though a recipe it uses
   * (typographic contrast at a small factor) would otherwise name one.
   */
  challenges?: string[];
};

const DIRECTIONS: Direction[] = [
  {
    mode: 'refine',
    title: 'Refine — tighten the rhythm',
    rationale: 'Keeps the current character and corrects the details that break the grid, the radius scale and the contrast rules.',
    recipes: [
      { id: 'rhythm.grid' },
      { id: 'radius.align' },
      { id: 'type.contrast', params: { factor: 1.1 } },
      { id: 'contrast.readability' },
    ],
    preserved: ['layout and hierarchy', 'colour palette', 'typographic family', 'component identity'],
    challenges: [],
  },
  {
    mode: 'reinterpret',
    title: 'Reinterpret — shift the visual language',
    rationale: 'Keeps structure and behaviour but replaces the surface language, spacing and type voice, so the same component reads with a different character.',
    recipes: [
      { id: 'surface.tint', params: { tone: 'paper' } },
      { id: 'radius.language', params: { style: 'sharp' } },
      { id: 'type.tracking', params: { hero: 'tight', label: 'loose' } },
      { id: 'density.scale', params: { factor: 1.15 } },
      { id: 'contrast.readability' },
    ],
    preserved: ['component size and behaviour', 'hierarchy', 'information architecture'],
  },
  {
    mode: 'mutate',
    title: 'Mutate — invert the surface',
    rationale: 'Deliberately pushes past the component’s current constraints: surfaces flip to their tonal opposite while every text node is re-balanced to stay readable.',
    recipes: [
      { id: 'surface.invert' },
      { id: 'radius.language', params: { style: 'sharp' } },
      { id: 'type.tracking', params: { hero: 'wide', label: 'loose' } },
      { id: 'contrast.readability' },
    ],
    preserved: ['component identity', 'size and layout mode', 'content and hierarchy'],
  },
];

const challengesFor = (recipes: RecipeSpec[]): string[] => {
  const seen = new Set<string>();
  for (const spec of recipes) {
    for (const challenge of RECIPES[spec.id]?.challenges ?? []) seen.add(challenge);
  }
  return [...seen];
};

const buildVariation = (snapshot: ComponentSnapshot, direction: Direction): Variation => {
  const { changes, rejected, used } = composeRecipes(snapshot, direction.recipes);
  const preserved = [...direction.preserved];
  if (rejected.length > 0) {
    preserved.push(`${rejected.length} unsupported change${rejected.length === 1 ? '' : 's'} rejected`);
  }
  const challenges = direction.challenges ?? challengesFor(direction.recipes.filter((s) => used.includes(s.id)));
  const recipeLabels = direction.recipes.filter((s) => used.includes(s.id)).map((s) => RECIPES[s.id].label);
  return {
    id: `${direction.mode}:${snapshot.root.id}`,
    sourceNodeId: snapshot.root.id,
    mode: direction.mode,
    title: direction.title,
    rationale: direction.rationale,
    changeSummary: describe(changes),
    changes,
    preservedConstraints: preserved,
    challengedConstraints: challenges,
    origin: 'rules',
    recipes: recipeLabels,
  } satisfies Variation;
};

export const generateVariations = (snapshot: ComponentSnapshot): Variation[] =>
  DIRECTIONS.map((direction) => buildVariation(snapshot, direction));

/** Builds a single direction by mode (used by tests and composition checks). */
export const buildDirection = (snapshot: ComponentSnapshot, mode: VariationMode): Variation => {
  const direction = DIRECTIONS.find((d) => d.mode === mode);
  if (!direction) throw new Error(`Unknown mode ${mode}`);
  return buildVariation(snapshot, direction);
};

export { dominantSurface, nearestBackground, isSurfaceNode, legibilityPass, TRACKING, RADIUS_STYLES, TINTS };
