export type EditCommandType = 'use_figma' | 'export_node' | 'get_node_tree';

export type EditCommand = {
  id: string;
  type: EditCommandType;
  payload: Record<string, unknown>;
};

export type EditResult =
  | { ok: true; result?: unknown }
  | { ok: false; code: string; error: string };
