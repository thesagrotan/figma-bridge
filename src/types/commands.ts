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
  | 'create_frame' | 'create_text' | 'update_node' | 'delete_node' | 'batch'
  | 'create_component' | 'create_instance' | 'set_fills' | 'set_text_style'
  | 'set_auto_layout' | 'move_to_page' | 'group_nodes' | 'export_node'
  | 'create_section' | 'set_prototype_link' | 'set_variable_binding'
  | 'get_node_tree' | 'inspect';

export type EditCommand = {
  id: string;
  type: EditCommandType;
  payload: Record<string, unknown>;
};

export type EditResult =
  | { ok: true; result?: unknown }
  | { ok: false; code: string; error: string };
