import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCanvasTools } from './canvas.js';
import { registerVariableTools } from './variables.js';
import { registerDesignContextTools } from './design-context.js';
import { registerFigjamTools } from './figjam.js';
import { registerMotionTools } from './motion.js';
import { registerShaderTools } from './shaders.js';
import { registerLibraryTools } from './libraries.js';
import { registerAssetTools } from './assets.js';
import { registerVideoTools } from './video.js';
import { registerPrompts } from './prompts.js';

export const registeredToolNames = [
  'use_figma',
  'get_screenshot',
  'get_metadata',
  'get_variable_defs',
  'get_design_context',
  'get_figjam',
  'get_motion_context',
  'download_assets',
  'upload_assets',
  'get_libraries',
  'search_design_system',
  'list_shaders',
  'get_shader',
  'list_file_shaders',
  'generate_diagram',
  'export_video',
] as const;

export function registerTools(server: McpServer): void {
  registerCanvasTools(server);
  registerVariableTools(server);
  registerDesignContextTools(server);
  registerFigjamTools(server);
  registerMotionTools(server);
  registerShaderTools(server);
  registerLibraryTools(server);
  registerAssetTools(server);
  registerVideoTools(server);
  registerPrompts(server);
}
