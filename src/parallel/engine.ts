import type { ComponentSnapshot, ComponentSnapshotNode, PropertyChange, Rgba, Variation, VariationMode } from './types.js';
import { findSnapshotNode, flattenSnapshot } from './snapshot.js';
import { contrastRatio, darken, isDark, isNearGrey, lighten, rgbaToHex, rotateHue, saturate } from './color.js';

/**
 * PARALLEL variation engine.
 *
 * Pure functions only: the engine reads a ComponentSnapshot and returns
 * validated, property-level changes. It never touches the Figma document, so
 * it can be exercised entirely from fixtures.
 */

const snapToGrid = (value: number, grid: number): number => Math.round(value / grid) * grid;

const nearest = (value: number, step: number): number => Math.round(value / step) * step;

const area = (node: ComponentSnapshotNode): number => Math.max(0, node.width) * Math.max(0, node.height);

const fillChange = (node: ComponentSnapshotNode, to: Rgba): PropertyChange | null => {
  if (!node.primaryFill || !node.capabilities.canRecolor) return null;
  return { kind: 'fill', targetId: node.id, fromHex: rgbaToHex(node.primaryFill.color), toHex: rgbaToHex(to), to };
};

/** Largest solid-filled node in the snapshot — the surface that dominates the eye. */
const dominantSurface = (snapshot: ComponentSnapshot): ComponentSnapshotNode | null => {
  const candidates = flattenSnapshot(snapshot.root).filter((n) => n.primaryFill && n.capabilities.canRecolor);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, node) => (area(node) > area(best) ? node : best));
};

const radiusTargets = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  flattenSnapshot(snapshot.root).filter((n) => n.capabilities.canAdjustRadius && typeof n.cornerRadius === 'number');

const spacingTargets = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  flattenSnapshot(snapshot.root).filter((n) => n.capabilities.canAdjustSpacing && n.layout.itemSpacing !== null);

const textTargets = (snapshot: ComponentSnapshot): ComponentSnapshotNode[] =>
  flattenSnapshot(snapshot.root).filter((n) => n.capabilities.canRestyleTypography && n.typography !== null);

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

/** Nudges a foreground toward readable contrast, preserving its hue. */
const ensureContrast = (foreground: Rgba, background: Rgba, minimum = 4.5): Rgba => {
  if (contrastRatio(foreground, background) >= minimum) return foreground;
  const towardLight = isDark(background);
  for (let step = 1; step <= 20; step++) {
    const candidate = towardLight ? lighten(foreground, step / 20) : darken(foreground, step / 20);
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return towardLight ? { r: 1, g: 1, b: 1, a: foreground.a } : { r: 0, g: 0, b: 0, a: foreground.a };
};

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
        case 'strokeColor':
          return node.capabilities.canRecolor ? null : 'Node has no solid paint to recolour.';
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

const describe = (changes: PropertyChange[]): string => {
  if (changes.length === 0) return 'No supported changes for this component.';
  return changes
    .map((change) => {
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
    })
    .join('; ');
};

// ---------------------------------------------------------------------------
// Refine: improve the existing design while preserving its visual character.
// ---------------------------------------------------------------------------
const buildRefine = (snapshot: ComponentSnapshot): PropertyChange[] => {
  const changes: PropertyChange[] = [];

  for (const node of spacingTargets(snapshot)) {
    const spacing = node.layout.itemSpacing as number;
    const snapped = snapToGrid(spacing, 4);
    if (spacing > 0 && snapped !== spacing) {
      changes.push({ kind: 'itemSpacing', targetId: node.id, from: spacing, to: snapped });
      break;
    }
  }

  if (changes.length === 0) {
    const node = spacingTargets(snapshot).find((n) => (n.layout.itemSpacing as number) >= 12);
    if (node) {
      const from = node.layout.itemSpacing as number;
      changes.push({ kind: 'itemSpacing', targetId: node.id, from, to: Math.max(4, from - 4) });
    }
  }

  for (const node of radiusTargets(snapshot)) {
    const radius = node.cornerRadius as number;
    if (radius > 0) {
      const snapped = nearest(radius, 4);
      if (snapped !== radius && snapped >= 0) {
        changes.push({ kind: 'cornerRadius', targetId: node.id, from: radius, to: snapped });
        break;
      }
    }
  }

  const background = snapshot.root.primaryFill?.color ?? null;
  if (background) {
    for (const node of textTargets(snapshot)) {
      const fill = node.primaryFill;
      const current = fill?.color ?? (isDark(background) ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0, g: 0, b: 0, a: 1 });
      if (contrastRatio(current, background) < 4.5) {
        const adjusted = ensureContrast(current, background);
        const change = fillChange(node, adjusted);
        if (change) {
          changes.push(change);
          break;
        }
      }
    }
  }

  if (changes.length === 0) {
    const node = radiusTargets(snapshot).find((n) => (n.cornerRadius as number) >= 2);
    if (node) {
      const from = node.cornerRadius as number;
      changes.push({ kind: 'cornerRadius', targetId: node.id, from, to: from + 2 });
    }
  }

  return changes;
};

// ---------------------------------------------------------------------------
// Reinterpret: a different visual language, same purpose and behaviour.
// ---------------------------------------------------------------------------
const buildReinterpret = (snapshot: ComponentSnapshot): PropertyChange[] => {
  const changes: PropertyChange[] = [];

  for (const node of radiusTargets(snapshot)) {
    const radius = node.cornerRadius as number;
    const flipped = radius >= 6 ? 2 : Math.min(24, radius + 12);
    if (flipped !== radius) {
      changes.push({ kind: 'cornerRadius', targetId: node.id, from: radius, to: flipped });
      break;
    }
  }

  const surface = dominantSurface(snapshot);
  if (surface?.primaryFill) {
    const base = surface.primaryFill.color;
    // A grey surface has no hue to rotate — tint it into a different
    // language instead: warm paper for light surfaces, deep indigo for dark.
    const shifted = isNearGrey(base)
      ? isDark(base)
        ? { r: 0.19, g: 0.21, b: 0.33, a: base.a }
        : { r: 0.99, g: 0.94, b: 0.83, a: base.a }
      : { ...saturate(rotateHue(base, 34), 1.2), a: base.a };
    const change = fillChange(surface, shifted);
    if (change) changes.push(change);
  }

  const text = textTargets(snapshot)[0];
  if (text?.typography) {
    const from = text.typography.letterSpacing;
    changes.push({ kind: 'letterSpacing', targetId: text.id, from, to: 0.4 });
  }

  return changes;
};

// ---------------------------------------------------------------------------
// Mutate: an experimental push that names the constraints it challenges.
// ---------------------------------------------------------------------------
const buildMutate = (snapshot: ComponentSnapshot): PropertyChange[] => {
  const changes: PropertyChange[] = [];
  const surface = dominantSurface(snapshot);

  if (surface?.primaryFill) {
    const base = surface.primaryFill.color;
    const inverted = isDark(base) ? lighten(base, 0.9) : darken(base, 0.88);
    const change = fillChange(surface, { ...inverted, a: base.a });
    if (change) changes.push(change);

    if (typeof surface.cornerRadius === 'number') {
      const from = surface.cornerRadius;
      changes.push({ kind: 'cornerRadius', targetId: surface.id, from, to: from > 4 ? 0 : 24 });
    }

    // Invert the surface, so keep the content legible against it. A deliberately
    // inverted card that cannot be read is a bug, not a direction. Each text node
    // is checked against the surface it actually sits on — text inside a nested
    // panel must not be flipped just because the outer card changed.
    const invertedSurface = { ...inverted, a: base.a };
    for (const node of textTargets(snapshot)) {
      if (node.id === surface.id) continue;
      const backgroundNode = nearestBackground(snapshot.root, node.id);
      const background =
        backgroundNode?.id === surface.id
          ? invertedSurface
          : backgroundNode?.primaryFill?.color ?? invertedSurface;
      const current =
        node.primaryFill?.color ??
        (isDark(background) ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0.12, g: 0.12, b: 0.15, a: 1 });
      if (contrastRatio(current, background) >= 4.5) continue;
      const textChange = fillChange(node, ensureContrast(current, background));
      if (textChange) changes.push(textChange);
    }
  }

  const text = textTargets(snapshot)[0];
  if (text?.typography) {
    changes.push({ kind: 'letterSpacing', targetId: text.id, from: text.typography.letterSpacing, to: 1.2 });
  }

  if (changes.length === 0) {
    const node = radiusTargets(snapshot)[0];
    if (node) changes.push({ kind: 'cornerRadius', targetId: node.id, from: node.cornerRadius, to: 0 });
  }

  if (changes.length === 0) {
    const node = spacingTargets(snapshot)[0];
    if (node && node.layout.itemSpacing !== null) {
      changes.push({ kind: 'itemSpacing', targetId: node.id, from: node.layout.itemSpacing, to: Math.round(node.layout.itemSpacing * 1.75) });
    }
  }

  return changes;
};

const PRESERVED: Record<VariationMode, string[]> = {
  refine: ['layout and hierarchy', 'colour palette', 'typographic family', 'component identity'],
  reinterpret: ['layout and spacing', 'component size and behaviour', 'hierarchy'],
  mutate: ['component identity', 'size and layout mode', 'content and hierarchy'],
};

const CHALLENGED: Record<VariationMode, string[]> = {
  refine: [],
  reinterpret: ['surface treatment (corner language)', 'accent hue'],
  mutate: ['surface colour dominance', 'corner language', 'typographic density'],
};

const TITLES: Record<VariationMode, string> = {
  refine: 'Refine — tighten the rhythm',
  reinterpret: 'Reinterpret — shift the visual language',
  mutate: 'Mutate — invert the surface',
};

const RATIONALE: Record<VariationMode, string> = {
  refine: 'Keeps the current character and corrects the details that break the underlying grid and contrast rules.',
  reinterpret: 'Keeps the structure and behaviour but replaces the surface language, so the same component reads with a different voice.',
  mutate: 'Deliberately pushes past the component’s current constraints to show what is on the other side of them.',
};

const buildForMode = (mode: VariationMode, snapshot: ComponentSnapshot): PropertyChange[] => {
  switch (mode) {
    case 'refine':
      return buildRefine(snapshot);
    case 'reinterpret':
      return buildReinterpret(snapshot);
    case 'mutate':
      return buildMutate(snapshot);
  }
};

export const generateVariations = (snapshot: ComponentSnapshot): Variation[] => {
  const modes: VariationMode[] = ['refine', 'reinterpret', 'mutate'];
  return modes.map((mode) => {
    const proposed = buildForMode(mode, snapshot);
    const { valid, rejected } = validateChanges(snapshot, proposed);
    const preserved = [...PRESERVED[mode]];
    const challenged = [...CHALLENGED[mode]];
    if (rejected.length > 0) {
      preserved.push(`${rejected.length} unsupported change${rejected.length === 1 ? '' : 's'} rejected`);
    }
    return {
      id: `${mode}:${snapshot.root.id}`,
      sourceNodeId: snapshot.root.id,
      mode,
      title: TITLES[mode],
      rationale: RATIONALE[mode],
      changeSummary: describe(valid),
      changes: valid,
      preservedConstraints: preserved,
      challengedConstraints: challenged,
    } satisfies Variation;
  });
};
