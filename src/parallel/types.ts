/**
 * PARALLEL shared contracts.
 *
 * These types are the single source of truth that every part of the pipeline
 * (inspection, variation engine, preview, safe application) agrees on.
 * They are deliberately small and explicit: only properties PARALLEL can
 * actually read and safely write are modelled.
 */

export type VariationMode = 'refine' | 'reinterpret' | 'mutate';

export const VARIATION_MODES: readonly VariationMode[] = ['refine', 'reinterpret', 'mutate'];

/** A solid RGBA colour in 0..1 channel space (Figma's representation). */
export type Rgba = { r: number; g: number; b: number; a: number };

export type NormalizedFill =
  | { kind: 'solid'; color: Rgba; hex: string }
  | { kind: 'gradient'; gradientType: string; stops: number }
  | { kind: 'image'; scaleMode: string }
  | { kind: 'other'; type: string };

/** Properties PARALLEL is allowed to read and, where flagged, write. */
export type SnapshotCapabilities = {
  /** Has at least one SOLID paint that can be recoloured. */
  canRecolor: boolean;
  /** Text node with readable/writable typography. */
  canRestyleTypography: boolean;
  /** Supports cornerRadius. */
  canAdjustRadius: boolean;
  /** Auto-layout frame whose spacing/padding can be tuned. */
  canAdjustSpacing: boolean;
  /** Auto-layout frame whose axis distribution could be changed (mutate only). */
  canChangeLayout: boolean;
  /** Component or instance: the node's identity must be preserved. */
  isComponentLike: boolean;
  /** Node is a text node. */
  isText: boolean;
  /** Node cannot receive child mutations safely (e.g. vector, boolean op). */
  isOpaqueGeometry: boolean;
};

export type SnapshotLayout = {
  mode: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  itemSpacing: number | null;
  padding: { top: number; right: number; bottom: number; left: number } | null;
  primaryAxisAlignItems: string | null;
  counterAxisAlignItems: string | null;
  layoutSizingHorizontal: string | null;
  layoutSizingVertical: string | null;
};

export type SnapshotTypography = {
  characters: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeightPx: number | null;
  letterSpacing: number | null;
  textAlignHorizontal: string | null;
};

export type SnapshotStroke = {
  color: Rgba;
  hex: string;
  weight: number;
};

/** One node in the normalized snapshot tree. */
export type ComponentSnapshotNode = {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  fills: NormalizedFill[];
  /** First SOLID fill, hoisted for convenience. */
  primaryFill: { color: Rgba; hex: string } | null;
  strokes: SnapshotStroke[];
  strokeWeight: number | null;
  cornerRadius: number | null;
  layout: SnapshotLayout;
  typography: SnapshotTypography | null;
  capabilities: SnapshotCapabilities;
  children: ComponentSnapshotNode[];
};

export type ComponentSnapshot = {
  root: ComponentSnapshotNode;
  /** Count of nodes captured (including root). */
  nodeCount: number;
  /** Human-readable notes about what could not be captured. */
  warnings: string[];
  /** Plugin-reported document/page context. */
  context: { fileName: string | null; pageName: string; selectionIds: string[] };
  capturedAt: string;
};

/**
 * A validated, property-level mutation. `targetId` refers to a node id inside
 * the snapshot tree. The engine only emits kinds it knows the plugin can apply.
 */
export type PropertyChange =
  | { kind: 'fill'; targetId: string; fromHex: string; toHex: string; to: Rgba }
  | { kind: 'cornerRadius'; targetId: string; from: number | null; to: number }
  | { kind: 'strokeWeight'; targetId: string; from: number | null; to: number }
  | { kind: 'strokeColor'; targetId: string; fromHex: string | null; toHex: string; to: Rgba }
  | { kind: 'itemSpacing'; targetId: string; from: number | null; to: number }
  | { kind: 'padding'; targetId: string; from: SnapshotLayout['padding']; to: NonNullable<SnapshotLayout['padding']> }
  | { kind: 'fontSize'; targetId: string; from: number; to: number }
  | { kind: 'fontStyle'; targetId: string; from: string; to: string }
  | { kind: 'letterSpacing'; targetId: string; from: number | null; to: number }
  | { kind: 'opacity'; targetId: string; from: number; to: number };

export type PropertyChangeKind = PropertyChange['kind'];

/** A generated alternative direction for the selected component. */
export type Variation = {
  id: string;
  sourceNodeId: string;
  mode: VariationMode;
  title: string;
  /** Why this direction exists, in designer language. */
  rationale: string;
  /** One-line summary of the concrete edits. */
  changeSummary: string;
  changes: PropertyChange[];
  /** Constraints the direction deliberately keeps intact. */
  preservedConstraints: string[];
  /** Constraints the direction deliberately pushes against. */
  challengedConstraints: string[];
};

export type VariationPreviewStatus = 'ready' | 'error' | 'empty';

export type VariationPreview = {
  variationId: string;
  sourceNodeId: string;
  status: VariationPreviewStatus;
  /** Base64 PNG of the rendered variation, when ready. */
  imageBase64: string | null;
  width: number | null;
  height: number | null;
  /** Populated when status is 'error' or 'empty'. */
  message: string | null;
};

export type PreviewSet = {
  sourceNodeId: string;
  /** Base64 PNG of the untouched original, for side-by-side comparison. */
  originalBase64: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  previews: VariationPreview[];
};

export type AppliedVariation = {
  variationId: string;
  mode: VariationMode;
  sourceNodeId: string;
  /** Id of the duplicate that received the changes. Null when creation failed. */
  createdNodeId: string | null;
  createdNodeName: string | null;
  success: boolean;
  /** Changes that applied cleanly. */
  appliedChangeKinds: PropertyChangeKind[];
  /** Non-fatal problems (e.g. a single property was skipped). */
  warnings: string[];
  /** Set when success is false. */
  error: string | null;
};

/** Result of undoing a previously applied variation. */
export type DiscardResult = {
  createdNodeId: string;
  discarded: boolean;
  error: string | null;
};

export type ExploreResult = {
  snapshot: ComponentSnapshot;
  variations: Variation[];
  previews: PreviewSet;
  warnings: string[];
};

export type PluginError = { ok: false; code: string; error: string };
export type PluginOk<T> = { ok: true; result: T };
export type PluginResult<T> = PluginOk<T> | PluginError;
