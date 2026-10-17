import { z } from 'zod';

export const fileKeySchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => {
    const match = value.match(/figma\.com\/(?:design|file)\/([^/?]+)/);
    return match?.[1] ?? value;
  });

export type EditCommandType =
  | 'use_figma'
  | 'export_node'
  | 'get_node_tree'
  | 'inspect'
  | 'parallel_snapshot'
  | 'parallel_preview'
  | 'parallel_apply'
  | 'parallel_discard';

export type EditCommand = {
  id: string;
  type: EditCommandType;
  payload: Record<string, unknown>;
};

export type EditResult =
  | { ok: true; result?: unknown }
  | { ok: false; code: string; error: string };
