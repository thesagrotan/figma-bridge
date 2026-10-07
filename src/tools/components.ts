import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { figmaRequest } from '../figmaApi.js';
import { fileKeySchema } from '../types/commands.js';

export function registerComponentsTools(server: McpServer): void {
  server.tool(
    'figma_get_components',
    'Get all components and component sets in a Figma file. Use this to discover reusable components before creating new frames.',
    {
      fileKey: fileKeySchema,
      version: z.string().optional(),
    },
    async ({ fileKey, version }) => {
      const qs = version ? `?version=${version}` : '';
      const [components, componentSets] = await Promise.all([
        figmaRequest(`/v1/files/${fileKey}/components${qs}`),
        figmaRequest(`/v1/files/${fileKey}/component_sets${qs}`)
      ]);
      
      return {
        content: [{ type: 'text', text: JSON.stringify({ components, componentSets }, null, 2) }],
      };
    }
  );
}
