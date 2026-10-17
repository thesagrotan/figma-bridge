import type { EditCommandType, EditResult } from '../types/commands.js';
import type { AppliedVariation, ComponentSnapshot, DiscardResult, ExploreResult, PropertyChangeKind, Variation, VariationPreview } from './types.js';
import { normalizeSnapshot, type RawSnapshot } from './snapshot.js';
import { generateVariations, validateChanges } from './engine.js';
import { isPluginConnected } from '../bridge/status.js';

export type Dispatcher = (type: EditCommandType, payload: Record<string, unknown>) => Promise<EditResult>;

export type ExploreInput = { nodeId?: string; name?: string; scale?: number };

/**
 * Server-side registry of generated variations.
 *
 * Applying a variation never trusts change data sent by a client: it looks the
 * variation up here and re-validates it against the snapshot captured at
 * generation time. This makes "explicit approval" meaningful — a caller can
 * only apply a variation PARALLEL actually generated.
 */
type RegisteredVariation = { variation: Variation; snapshot: ComponentSnapshot; createdAt: number };

const parseTtl = (): number => {
  const parsed = Number(process.env.PARALLEL_REGISTRY_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
};
const REGISTRY_TTL_MS = parseTtl();
const registry = new Map<string, RegisteredVariation>();

/** Nodes created by applyVariation, so the panel can offer to remove any of them. */
const appliedNodes = new Map<string, { variationId: string; mode: string }>();
export const listAppliedNodes = (): Array<{ nodeId: string; variationId: string; mode: string }> =>
  [...appliedNodes.entries()].map(([nodeId, meta]) => ({ nodeId, ...meta }));

const pruneRegistry = (now = Date.now()) => {
  for (const [id, entry] of registry) {
    if (now - entry.createdAt > REGISTRY_TTL_MS) registry.delete(id);
  }
};

export const getRegisteredVariation = (id: string): RegisteredVariation | null => {
  pruneRegistry();
  return registry.get(id) ?? null;
};

export const listRegisteredVariations = (): Array<{ id: string; mode: string; sourceNodeId: string }> =>
  [...registry.values()].map((entry) => ({ id: entry.variation.id, mode: entry.variation.mode, sourceNodeId: entry.variation.sourceNodeId }));

const unwrapResult = <T>(result: EditResult, action: string): T => {
  if (!result.ok) {
    const error = new Error(`${action} failed [${result.code}]: ${result.error}`) as Error & { code?: string };
    error.code = result.code;
    throw error;
  }
  return result.result as T;
};

const toPreview = (variation: Variation, pluginResult: { base64?: unknown; width?: unknown; height?: unknown; warnings?: unknown }): VariationPreview => {
  const base64 = typeof pluginResult.base64 === 'string' ? pluginResult.base64 : null;
  return {
    variationId: variation.id,
    sourceNodeId: variation.sourceNodeId,
    status: base64 ? 'ready' : 'empty',
    imageBase64: base64,
    width: typeof pluginResult.width === 'number' ? pluginResult.width : null,
    height: typeof pluginResult.height === 'number' ? pluginResult.height : null,
    message: base64 ? null : 'The plugin returned no image for this variation.',
  };
};

const NO_PLUGIN_MESSAGE =
  'No Figma plugin is connected. Open Figma Desktop, run Plugins → Development → Local Figma Bridge, then try again.';

const requirePlugin = (): void => {
  if (!isPluginConnected()) throw new Error(NO_PLUGIN_MESSAGE);
};

/** Inspect → generate → render previews. The full exploration pass. */
const clampScale = (value: unknown): number => {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : 2;
  return Math.min(4, Math.max(0.5, parsed));
};

export const explore = async (dispatch: Dispatcher, input: ExploreInput): Promise<ExploreResult> => {
  requirePlugin();
  const warnings: string[] = [];
  const scale = clampScale(input.scale);

  const rawResult = await dispatch('parallel_snapshot', {
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    ...(input.name ? { name: input.name } : {}),
  });
  const raw = unwrapResult<RawSnapshot>(rawResult, 'Component inspection');
  const snapshot = normalizeSnapshot(raw);
  warnings.push(...snapshot.warnings);

  const variations = generateVariations(snapshot);
  pruneRegistry();
  for (const variation of variations) registry.set(variation.id, { variation, snapshot, createdAt: Date.now() });

  let originalBase64: string | null = null;
  let originalWidth: number | null = null;
  let originalHeight: number | null = null;
  try {
    const original = unwrapResult<{ base64?: unknown; byteLength?: unknown }>(
      await dispatch('export_node', { nodeId: snapshot.root.id, format: 'PNG', scale }),
      'Original render',
    );
    if (typeof original.base64 === 'string') {
      originalBase64 = original.base64;
      originalWidth = Math.round(snapshot.root.width * scale);
      originalHeight = Math.round(snapshot.root.height * scale);
    }
  } catch (error) {
    warnings.push(`Could not render the original: ${error instanceof Error ? error.message : String(error)}`);
  }

  const previews: VariationPreview[] = [];
  for (const variation of variations) {
    if (variation.changes.length === 0) {
      previews.push({
        variationId: variation.id,
        sourceNodeId: variation.sourceNodeId,
        status: 'empty',
        imageBase64: null,
        width: null,
        height: null,
        message: 'This component has no properties PARALLEL can safely change, so no preview was generated.',
      });
      continue;
    }

    try {
      const result = unwrapResult<Record<string, unknown>>(
        await dispatch('parallel_preview', {
          nodeId: snapshot.root.id,
          variationId: variation.id,
          changes: variation.changes,
          scale,
        }),
        `Preview for ${variation.mode}`,
      );
      const preview = toPreview(variation, result);
      if (Array.isArray(result.warnings) && result.warnings.length > 0) preview.message = `Applied with warnings: ${result.warnings.join(' ')}`;
      previews.push(preview);
    } catch (error) {
      previews.push({
        variationId: variation.id,
        sourceNodeId: variation.sourceNodeId,
        status: 'error',
        imageBase64: null,
        width: null,
        height: null,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    snapshot,
    variations,
    previews: { sourceNodeId: snapshot.root.id, originalBase64, originalWidth, originalHeight, previews },
    warnings,
  };
};

export type ApplyInput = { variationId: string; approved: boolean };

/** Duplicate the source and apply a registered variation. The original is never touched. */
export const applyVariation = async (dispatch: Dispatcher, input: ApplyInput): Promise<AppliedVariation> => {
  requirePlugin();
  const entry = getRegisteredVariation(input.variationId);
  if (!entry) {
    throw new Error(`Unknown or expired variation "${input.variationId}". Run explore again to regenerate directions.`);
  }

  const { variation, snapshot } = entry;

  const { valid, rejected } = validateChanges(snapshot, variation.changes);
  if (!input.approved) {
    throw new Error('Applying a variation requires explicit approval (approved: true).');
  }
  if (valid.length === 0) {
    throw new Error(
      rejected.length > 0
        ? `All proposed changes are unsupported: ${rejected.map((r) => r.reason).join(' ')}`
        : 'This variation has no supported changes, so there is nothing to apply.',
    );
  }

  const result = await dispatch('parallel_apply', {
    nodeId: variation.sourceNodeId,
    variationId: variation.id,
    mode: variation.mode,
    changes: valid,
  });

  if (!result.ok) {
    return {
      variationId: variation.id,
      mode: variation.mode,
      sourceNodeId: variation.sourceNodeId,
      createdNodeId: null,
      createdNodeName: null,
      success: false,
      appliedChangeKinds: [],
      warnings: rejected.map((r) => r.reason),
      error: `${result.error} [${result.code}]`,
    };
  }

  const payload = result.result as {
    createdNodeId?: unknown;
    createdNodeName?: unknown;
    appliedKinds?: unknown;
    warnings?: unknown;
  };
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];
  warnings.push(...rejected.map((r) => `Rejected before apply: ${r.reason}`));

  const createdNodeId = typeof payload.createdNodeId === 'string' ? payload.createdNodeId : null;

  if (createdNodeId) appliedNodes.set(createdNodeId, { variationId: variation.id, mode: variation.mode });

  return {
    variationId: variation.id,
    mode: variation.mode,
    sourceNodeId: variation.sourceNodeId,
    createdNodeId,
    createdNodeName: typeof payload.createdNodeName === 'string' ? payload.createdNodeName : null,
    success: createdNodeId !== null,
    appliedChangeKinds: Array.isArray(payload.appliedKinds) ? (payload.appliedKinds as PropertyChangeKind[]) : [],
    warnings,
    error: createdNodeId === null ? 'The plugin did not return a created node id.' : null,
  };
};

/** Remove a node created by applyVariation. */
export const discardNode = async (dispatch: Dispatcher, nodeId: string): Promise<DiscardResult> => {
  requirePlugin();
  const result = await dispatch('parallel_discard', { nodeId });
  if (!result.ok) {
    return { createdNodeId: nodeId, discarded: false, error: `${result.error} [${result.code}]` };
  }
  appliedNodes.delete(nodeId);
  return { createdNodeId: nodeId, discarded: true, error: null };
};
