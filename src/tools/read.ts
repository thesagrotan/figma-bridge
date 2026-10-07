import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { figmaRequest } from '../figmaApi.js';
import { fileKeySchema } from '../types/commands.js';
import { registerStylesTools } from './styles.js';
import { registerComponentsTools } from './components.js';
import { registerCommentsTools } from './comments.js';

export function registerReadTools(server: McpServer): void {
  server.tool(
    'figma_get_file',
    'Get file JSON.',
    {
      fileKey: fileKeySchema,
      version: z.string().optional(),
      depth: z.number().int().min(1).max(10).optional(),
    },
    async ({ fileKey, version, depth }) => {
      const params = new URLSearchParams();
      if (version) params.append('version', version);
      if (depth !== undefined) params.append('depth', depth.toString());
      const qs = params.toString() ? `?${params.toString()}` : '';
      
      const response = await figmaRequest(`/v1/files/${fileKey}${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };
    }
  );

  server.tool(
    'figma_get_nodes',
    'Get nodes from file.',
    {
      fileKey: fileKeySchema,
      nodeIds: z.array(z.string().trim().min(1)).min(1),
      version: z.string().optional(),
    },
    async ({ fileKey, nodeIds, version }) => {
      const params = new URLSearchParams();
      params.append('ids', nodeIds.join(','));
      if (version) params.append('version', version);
      const qs = `?${params.toString()}`;
      
      const response = await figmaRequest(`/v1/files/${fileKey}/nodes${qs}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };
    }
  );

  server.tool(
    'figma_render_nodes',
    'Render nodes to images.',
    {
      fileKey: fileKeySchema,
      nodeIds: z.array(z.string().trim().min(1)).min(1),
      format: z.enum(['jpg','png','svg','pdf']).default('png'),
      scale: z.number().min(0.01).max(4).default(1),
      returnBase64: z.boolean().default(false),
    },
    async ({ fileKey, nodeIds, format, scale, returnBase64 }) => {
      const params = new URLSearchParams();
      params.append('ids', nodeIds.join(','));
      params.append('format', format);
      params.append('scale', scale.toString());
      
      const response = await figmaRequest<{ images: Record<string, string> }>(`/v1/images/${fileKey}?${params.toString()}`);
      
      if (returnBase64 && response.images) {
        const blocks: any[] = [];
        blocks.push({ type: 'text', text: JSON.stringify(response, null, 2) });
        
        for (const [id, url] of Object.entries(response.images)) {
          if (url) {
            const imgRes = await fetch(url);
            const arrayBuffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            
            let mimeType = `image/${format}`;
            if (format === 'jpg') mimeType = 'image/jpeg';
            else if (format === 'svg') mimeType = 'image/svg+xml';
            else if (format === 'pdf') mimeType = 'application/pdf';
            
            blocks.push({ type: 'image', data: base64, mimeType });
          }
        }
        return { content: blocks };
      }
      
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };
    }
  );

  server.tool(
    'figma_get_versions',
    'Get the version history of a Figma file.',
    {
      fileKey: fileKeySchema,
    },
    async ({ fileKey }) => {
      const response = await figmaRequest(`/v1/files/${fileKey}/versions`);
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };
    }
  );

  registerStylesTools(server);
  registerComponentsTools(server);
  registerCommentsTools(server);
}
