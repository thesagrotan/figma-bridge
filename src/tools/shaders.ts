import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { fileParam, fromEditResult } from './shared.js';

export const listShadersSchema = {
  file: fileParam,
};

export const getShaderSchema = {
  id: z.string().min(1).describe('Shader id from list_shaders'),
  file: fileParam,
};

export const listFileShadersSchema = {
  allPages: z.boolean().optional().default(false).describe('Scan every page instead of the current page'),
  maxNodes: z.number().int().positive().max(50_000).optional().describe('Maximum nodes to scan'),
  file: fileParam,
};

export function registerShaderTools(server: McpServer): void {
  server.tool(
    'list_shaders',
    'List shader effects and fills available to the open Figma file. This is the file-available set from the Plugin API, not the full account library, and does not include shader source.',
    listShadersSchema,
    async ({ file }) => fromEditResult(await executeEdit('list_shaders', {}, file))
  );

  server.tool(
    'get_shader',
    'Return metadata and property definitions for a shader available to the open file. Shader source/GLSL and version history are not exposed by the Figma Plugin API.',
    getShaderSchema,
    async ({ id, file }) => fromEditResult(await executeEdit('get_shader', { id }, file))
  );

  server.tool(
    'list_file_shaders',
    'List shader effects and fills used in the open file, with node usage and property values. Source manifests are unavailable; use list_shaders/get_shader for file-available metadata.',
    listFileShadersSchema,
    async ({ allPages, maxNodes, file }) =>
      fromEditResult(
        await executeEdit(
          'list_file_shaders',
          { allPages, ...(maxNodes !== undefined ? { maxNodes } : {}) },
          file,
        ),
      )
  );
}
