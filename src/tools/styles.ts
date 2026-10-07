import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { figmaRequest } from '../figmaApi.js';
import { fileKeySchema } from '../types/commands.js';

export function registerStylesTools(server: McpServer): void {
  server.tool(
    'figma_get_styles',
    'Get all styles (colors, text, effects, grids) defined in a Figma file. Use this to read design tokens.',
    {
      fileKey: fileKeySchema,
      version: z.string().optional(),
    },
    async ({ fileKey, version }) => {
      const qs = version ? `?version=${version}` : '';
      const response = await figmaRequest(`/v1/files/${fileKey}/styles${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    }
  );
}
