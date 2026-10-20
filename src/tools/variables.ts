import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { fileParam, fromEditResult } from './shared.js';

export const getVariableDefsSchema = {
  nodeId: z.string().optional().describe('Node id to inspect. Defaults to the current selection or page.'),
  name: z.string().optional().describe('Node name to inspect when nodeId is not provided.'),
  maxDepth: z.number().int().min(0).max(20).optional().default(8).describe('Maximum subtree depth to scan'),
  maxNodes: z.number().int().positive().max(5_000).optional().describe('Maximum number of nodes to scan'),
  file: fileParam,
};

export function registerVariableTools(server: McpServer): void {
  server.tool(
    'get_variable_defs',
    'List the variables and styles used in a node, the selection, or the current page. Returns resolved values plus definitions and usage sites.',
    getVariableDefsSchema,
    async ({ nodeId, name, maxDepth, maxNodes, file }) => {
      const result = await executeEdit(
        'get_variable_defs',
        {
          ...(nodeId ? { nodeId } : {}),
          ...(name ? { name } : {}),
          maxDepth,
          ...(maxNodes !== undefined ? { maxNodes } : {}),
        },
        file,
      );
      return fromEditResult(result);
    }
  );
}
