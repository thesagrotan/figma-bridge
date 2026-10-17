import type {
  ComponentSnapshot,
  ComponentSnapshotNode,
  NormalizedFill,
  Rgba,
  SnapshotCapabilities,
  SnapshotLayout,
  SnapshotStroke,
  SnapshotTypography,
} from './types.js';
import { rgbaToHex } from './color.js';

/**
 * Raw node shape emitted by the plugin sandbox (`parallel_snapshot`).
 * Every field is optional because a plugin may omit values it cannot read
 * (Figma's `figma.mixed`, locked nodes, unsupported node types).
 */
export type RawNode = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  visible?: unknown;
  opacity?: unknown;
  fills?: unknown;
  strokes?: unknown;
  strokeWeight?: unknown;
  cornerRadius?: unknown;
  layoutMode?: unknown;
  itemSpacing?: unknown;
  paddingLeft?: unknown;
  paddingRight?: unknown;
  paddingTop?: unknown;
  paddingBottom?: unknown;
  primaryAxisAlignItems?: unknown;
  counterAxisAlignItems?: unknown;
  layoutSizingHorizontal?: unknown;
  layoutSizingVertical?: unknown;
  characters?: unknown;
  fontSize?: unknown;
  fontName?: unknown;
  lineHeight?: unknown;
  letterSpacing?: unknown;
  textAlignHorizontal?: unknown;
  children?: unknown;
};

export type RawSnapshot = {
  root?: RawNode;
  context?: { fileName?: unknown; pageName?: unknown; selectionIds?: unknown };
};

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const numOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const MUTATION_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE', 'SLICE']);

const normalizePaint = (paint: RawNode): NormalizedFill | null => {
  if (!paint || typeof paint !== 'object') return null;
  const type = str((paint as { type?: unknown }).type, 'UNKNOWN');
  if (type === 'SOLID') {
    const c = (paint as { color?: Partial<Rgba> }).color ?? {};
    const color: Rgba = { r: num(c.r), g: num(c.g), b: num(c.b), a: num((paint as { opacity?: unknown }).opacity, 1) };
    return { kind: 'solid', color, hex: rgbaToHex(color) };
  }
  if (type.startsWith('GRADIENT')) {
    const stops = Array.isArray((paint as { gradientStops?: unknown[] }).gradientStops) ? (paint as { gradientStops: unknown[] }).gradientStops.length : 0;
    return { kind: 'gradient', gradientType: type, stops };
  }
  if (type === 'IMAGE') return { kind: 'image', scaleMode: str((paint as { scaleMode?: unknown }).scaleMode, 'FILL') };
  return { kind: 'other', type };
};

const normalizeFills = (value: unknown): NormalizedFill[] => {
  if (!Array.isArray(value)) return [];
  return value.map((p) => normalizePaint(p as RawNode)).filter((p): p is NormalizedFill => p !== null && p.kind !== 'other');
};

const normalizeStrokes = (value: unknown, weight: number | null): SnapshotStroke[] => {
  if (!Array.isArray(value)) return [];
  const out: SnapshotStroke[] = [];
  for (const raw of value) {
    const paint = normalizePaint(raw as RawNode);
    if (paint && paint.kind === 'solid') out.push({ color: paint.color, hex: paint.hex, weight: weight ?? 1 });
  }
  return out;
};

const asPx = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const obj = value as { unit?: unknown; value?: unknown };
    if (obj.unit === 'PIXELS' && typeof obj.value === 'number') return obj.value;
  }
  return null;
};

const normalizeLayout = (node: RawNode): SnapshotLayout => {
  const mode = str(node.layoutMode, 'NONE');
  const hasPadding =
    typeof node.paddingLeft === 'number' || typeof node.paddingRight === 'number' || typeof node.paddingTop === 'number' || typeof node.paddingBottom === 'number';
  return {
    mode: mode === 'HORIZONTAL' || mode === 'VERTICAL' ? mode : 'NONE',
    itemSpacing: numOrNull(node.itemSpacing),
    padding: hasPadding
      ? { top: num(node.paddingTop), right: num(node.paddingRight), bottom: num(node.paddingBottom), left: num(node.paddingLeft) }
      : null,
    primaryAxisAlignItems: strOrNull(node.primaryAxisAlignItems),
    counterAxisAlignItems: strOrNull(node.counterAxisAlignItems),
    layoutSizingHorizontal: strOrNull(node.layoutSizingHorizontal),
    layoutSizingVertical: strOrNull(node.layoutSizingVertical),
  };
};

const normalizeTypography = (node: RawNode): SnapshotTypography | null => {
  if (typeof node.characters !== 'string') return null;
  const fontName = (node.fontName ?? {}) as { family?: unknown; style?: unknown };
  return {
    characters: node.characters,
    fontFamily: str(fontName.family, 'Unknown'),
    fontStyle: str(fontName.style, 'Regular'),
    fontSize: num(node.fontSize, 14),
    lineHeightPx: asPx(node.lineHeight),
    letterSpacing: asPx(node.letterSpacing),
    textAlignHorizontal: strOrNull(node.textAlignHorizontal),
  };
};

const deriveCapabilities = (node: RawNode, fills: NormalizedFill[], typography: SnapshotTypography | null, layout: SnapshotLayout): SnapshotCapabilities => {
  const type = str(node.type, 'UNKNOWN');
  const isText = typography !== null || type === 'TEXT';
  const isComponentLike = type === 'COMPONENT' || type === 'COMPONENT_SET' || type === 'INSTANCE';
  const layoutMode = layout.mode !== 'NONE';
  return {
    canRecolor: fills.some((f) => f.kind === 'solid'),
    canRestyleTypography: isText,
    canAdjustRadius: typeof node.cornerRadius === 'number' || layoutMode,
    canAdjustSpacing: layoutMode,
    canChangeLayout: layoutMode,
    isComponentLike,
    isText,
    isOpaqueGeometry: MUTATION_TYPES.has(type),
  };
};

/** Depth cap defends against a malformed or hostile plugin payload. */
const MAX_DEPTH = 64;

const normalizeNode = (node: RawNode, warnings: string[], depth = 0): ComponentSnapshotNode | null => {
  const id = str(node.id);
  if (!id) {
    warnings.push('Encountered a node without an id; it was skipped.');
    return null;
  }
  if (depth > MAX_DEPTH) {
    warnings.push(`Tree deeper than ${MAX_DEPTH} levels was truncated at node ${id}.`);
    return null;
  }
  const type = str(node.type, 'UNKNOWN');
  const fills = normalizeFills(node.fills);
  const strokeWeight = numOrNull(node.strokeWeight);
  const layout = normalizeLayout(node);
  const typography = normalizeTypography(node);
  const primarySolid = fills.find((f) => f.kind === 'solid');
  const childrenRaw = Array.isArray(node.children) ? node.children : [];
  const children: ComponentSnapshotNode[] = [];
  for (const child of childrenRaw) {
    const normalized = normalizeNode(child as RawNode, warnings, depth + 1);
    if (normalized) children.push(normalized);
  }

  if (MUTATION_TYPES.has(type)) warnings.push(`Node ${id} (${type}) is opaque geometry; only paint changes will be offered.`);

  return {
    id,
    name: str(node.name, type),
    type,
    width: num(node.width),
    height: num(node.height),
    x: num(node.x),
    y: num(node.y),
    opacity: typeof node.opacity === 'number' ? node.opacity : 1,
    visible: node.visible !== false,
    fills,
    primaryFill: primarySolid && primarySolid.kind === 'solid' ? { color: primarySolid.color, hex: primarySolid.hex } : null,
    strokes: normalizeStrokes(node.strokes, strokeWeight),
    strokeWeight,
    cornerRadius: numOrNull(node.cornerRadius),
    layout,
    typography,
    capabilities: deriveCapabilities(node, fills, typography, layout),
    children,
  };
};

const countNodes = (node: ComponentSnapshotNode): number => 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);

/** Normalizes the plugin's raw tree into the PARALLEL snapshot contract. */
export const normalizeSnapshot = (raw: RawSnapshot | null | undefined, now = new Date()): ComponentSnapshot => {
  const warnings: string[] = [];
  const rootNode = raw && raw.root ? normalizeNode(raw.root, warnings) : null;

  if (!rootNode) {
    throw new Error('Snapshot is empty: the plugin did not return a root node.');
  }

  const context = raw?.context ?? {};
  const selectionIds = Array.isArray(context.selectionIds) ? context.selectionIds.map((v) => str(v)).filter(Boolean) : [];

  return {
    root: rootNode,
    nodeCount: countNodes(rootNode),
    warnings,
    context: {
      fileName: strOrNull(context.fileName),
      pageName: str(context.pageName, 'Page 1'),
      selectionIds,
    },
    capturedAt: now.toISOString(),
  };
};

/** Flattens a snapshot tree into a lookup used by the variation engine. */
export const flattenSnapshot = (root: ComponentSnapshotNode): ComponentSnapshotNode[] => [root, ...root.children.flatMap(flattenSnapshot)];

export const findSnapshotNode = (root: ComponentSnapshotNode, id: string): ComponentSnapshotNode | null =>
  flattenSnapshot(root).find((n) => n.id === id) ?? null;
