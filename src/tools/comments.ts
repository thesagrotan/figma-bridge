import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { figmaRequest } from '../figmaApi.js';
import { fileKeySchema } from '../types/commands.js';

export function registerCommentsTools(server: McpServer): void {
  server.tool(
    'figma_get_comments',
    'Get all comments on a Figma file.',
    {
      fileKey: fileKeySchema,
    },
    async ({ fileKey }) => {
      const response = await figmaRequest(`/v1/files/${fileKey}/comments`);
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    }
  );

  server.tool(
    'figma_post_comment',
    'Post a comment on a Figma file, optionally anchored to a specific node.',
    {
      fileKey: fileKeySchema,
      message: z.string().min(1),
      nodeId: z.string().optional(),
      client_meta: z.record(z.unknown()).optional(),
    },
    async ({ fileKey, message, nodeId, client_meta }) => {
      const body: Record<string, unknown> = { message };
      if (nodeId) body.node_id = nodeId;
      if (client_meta) body.client_meta = client_meta;

      const response = await figmaRequest(`/v1/files/${fileKey}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    }
  );
}
