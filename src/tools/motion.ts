import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { fileParam, fromEditResult } from './shared.js';

export const getMotionContextSchema = {
  nodeId: z.string().optional().describe('Animated node id. Defaults to the current selection or page.'),
  recursive: z.boolean().optional().default(false).describe('Include animated descendants'),
  maxDepth: z.number().int().min(0).max(20).optional().default(10).describe('Maximum traversal depth'),
  maxNodes: z.number().int().positive().max(2_000).optional().describe('Maximum nodes to inspect'),
  clientLanguages: z.string().optional().describe('Accepted for official client compatibility; informational only'),
  clientFrameworks: z.string().optional().describe('Accepted for official client compatibility; informational only'),
  file: fileParam,
};

export function registerMotionTools(server: McpServer): void {
  server.tool(
    'get_motion_context',
    'Inspect Figma Motion keyframes, timelines, animation styles, and manual tracks for a node. Generates CSS @keyframes and Motion snippets where the data can be translated; animation styles are returned as metadata because they cannot be reproduced exactly.',
    getMotionContextSchema,
    async ({ nodeId, recursive, maxDepth, maxNodes, clientLanguages, clientFrameworks, file }) => {
      const result = await executeEdit(
        'get_motion_context',
        {
          ...(nodeId ? { nodeId } : {}),
          recursive,
          maxDepth,
          ...(maxNodes !== undefined ? { maxNodes } : {}),
          ...(clientLanguages ? { clientLanguages } : {}),
          ...(clientFrameworks ? { clientFrameworks } : {}),
        },
        file,
      );
      return fromEditResult(result);
    }
  );
}
