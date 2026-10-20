export type EditCommandType =
  | 'use_figma'
  | 'export_node'
  | 'get_node_tree'
  | 'get_variable_defs'
  | 'get_design_context'
  | 'get_figjam'
  | 'download_assets'
  | 'upload_assets'
  | 'get_motion_context'
  | 'get_libraries'
  | 'search_design_system'
  | 'list_shaders'
  | 'get_shader'
  | 'list_file_shaders'
  | 'generate_diagram'
  | 'export_video';

export type EditCommand = {
  id: string;
  type: EditCommandType;
  payload: Record<string, unknown>;
  expiresAt?: number;
};

export type EditResult =
  | { ok: true; result?: unknown }
  | { ok: false; code: string; error: string; stack?: string };
