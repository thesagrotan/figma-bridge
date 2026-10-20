import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { asRecord, fileParam, jsonText, pickString } from './shared.js';

export const getFigjamSchema = {
  nodeId: z.string().optional().describe('FigJam node id. Defaults to the current selection or page.'),
  maxDepth: z.number().int().min(0).max(30).optional().default(10).describe('Maximum subtree depth'),
  maxNodes: z.number().int().positive().max(5_000).optional().describe('Maximum number of nodes'),
  includeImagesOfNodes: z.boolean().optional().default(true).describe('Include bounded PNG previews of nodes'),
  file: fileParam,
};

export const generateDiagramSchema = {
  name: z.string().min(1).describe('Human-readable diagram title'),
  mermaidSyntax: z
    .string()
    .min(1)
    .describe('Mermaid flowchart/graph syntax. Only graph and flowchart diagrams are supported locally.'),
  direction: z.enum(['LR', 'RL', 'TB', 'BT']).optional().describe('Override the Mermaid direction'),
  maxNodes: z.number().int().positive().max(200).optional().describe('Maximum generated shapes'),
  file: fileParam,
};

export function registerFigjamTools(server: McpServer): void {
  server.tool(
    'get_figjam',
    'Return an XML outline of a FigJam diagram with FigJam-specific fields plus bounded node screenshots. Only works when the open file is a FigJam board.',
    getFigjamSchema,
    async ({ nodeId, maxDepth, maxNodes, includeImagesOfNodes, file }) => {
      const result = await executeEdit(
        'get_figjam',
        {
          ...(nodeId ? { nodeId } : {}),
          maxDepth,
          ...(maxNodes !== undefined ? { maxNodes } : {}),
          includeImagesOfNodes,
        },
        file,
      );

      if (!result.ok) {
        return { content: [{ type: 'text', text: jsonText(result) }], isError: true };
      }

      const payload = asRecord(result.result) ?? {};
      const xml = pickString(payload.xml) ?? '';
      const images = Array.isArray(payload.images) ? payload.images : [];
      const metadata = {
        truncated: payload.truncated === true,
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
        imageCount: images.length,
      };

      const content: Array<Record<string, unknown>> = [{ type: 'text', text: xml }];
      if (metadata.truncated || metadata.warnings.length > 0) {
        content.push({ type: 'text', text: jsonText(metadata) });
      }
      for (const image of images) {
        const record = asRecord(image);
        const base64 = pickString(record?.base64);
        if (!base64) continue;
        content.push({
          type: 'image',
          data: base64,
          mimeType: pickString(record?.mimeType) ?? 'image/png',
        });
      }

      return { content } as never;
    }
  );

  server.tool(
    'generate_diagram',
    'Generate a FigJam flowchart from a Mermaid graph/flowchart definition. Supports a documented subset of nodes, shapes, labels, and connectors; other Mermaid diagram types return UNSUPPORTED_DIAGRAM_TYPE.',
    generateDiagramSchema,
    async ({ name, mermaidSyntax, direction, maxNodes, file }) => {
      const result = await executeEdit(
        'generate_diagram',
        { name, mermaidSyntax, ...(direction ? { direction } : {}), ...(maxNodes ? { maxNodes } : {}) },
        file,
      );
      if (!result.ok) {
        return { content: [{ type: 'text', text: jsonText(result) }], isError: true };
      }
      return { content: [{ type: 'text', text: jsonText(result.result) }] };
    }
  );
}
