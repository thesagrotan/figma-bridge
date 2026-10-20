import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { fileParam, fromEditResult } from './shared.js';

export const useFigmaSchema = {
  code: z.string().max(50_000).describe('JavaScript code using Figma Plugin API to execute in document context'),
  description: z
    .string()
    .max(2_000)
    .optional()
    .describe('Accepted for compatibility with Figma clients; informational only'),
  skillNames: z.string().optional().describe('Accepted for compatibility with Figma clients and ignored'),
  file: fileParam,
};

export const getScreenshotSchema = {
  nodeId: z.string().optional().describe('Node ID to capture. If omitted, captures selection or current page.'),
  name: z.string().optional().describe('Node name to capture.'),
  contentsOnly: z
    .boolean()
    .optional()
    .describe('When true, renders the node in isolation without overlapping page content.'),
  maxDimension: z
    .number()
    .int()
    .positive()
    .max(65_536)
    .optional()
    .describe('Maximum pixel size of the longer rendered edge. Preserves aspect ratio.'),
  enableBase64Response: z
    .boolean()
    .optional()
    .default(true)
    .describe('Accepted for compatibility. Local responses always include inline base64.'),
  file: fileParam,
};

export const getMetadataSchema = {
  nodeId: z.string().optional().describe('Node ID to inspect. If omitted, returns document / current page metadata.'),
  maxDepth: z.number().optional().default(4).describe('Maximum tree depth to traverse'),
  maxNodes: z.number().int().positive().max(20_000).optional().describe('Maximum number of nodes to serialize'),
  format: z
    .enum(['json', 'xml'])
    .optional()
    .describe('Output format. JSON is the default and preserves this server\'s existing behavior.'),
  file: fileParam,
};

export function registerCanvasTools(server: McpServer): void {
  server.tool(
    'use_figma',
    'Execute JavaScript code using Figma Plugin API in document context.',
    useFigmaSchema,
    async ({ code, file }) => {
      const result = await executeEdit('use_figma', { code }, file);

      if (!result.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.result !== undefined ? result.result : result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    'get_screenshot',
    'Capture and export a screenshot of a node or the current selection / page.',
    getScreenshotSchema,
    async ({ nodeId, name, contentsOnly, maxDimension, file }) => {
      const result = await executeEdit(
        'export_node',
        {
          scale: 2,
          format: 'PNG',
          ...(nodeId ? { nodeId } : {}),
          ...(name ? { name } : {}),
          ...(contentsOnly !== undefined ? { contentsOnly } : {}),
          ...(maxDimension !== undefined ? { maxDimension } : {}),
        },
        file,
      );

      if (
        result.ok &&
        typeof result.result === 'object' &&
        result.result !== null &&
        'base64' in result.result &&
        typeof (result.result as { base64: unknown }).base64 === 'string'
      ) {
        const base64Data = (result.result as { base64: string }).base64;
        return {
          content: [{ type: 'image', data: base64Data, mimeType: 'image/png' }],
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      };
    }
  );

  server.tool(
    'get_metadata',
    'Inspect document metadata or traverse a node tree hierarchy. Set format to "xml" for an official-style outline.',
    getMetadataSchema,
    async ({ nodeId, maxDepth, maxNodes, format, file }) => {
      const result = await executeEdit(
        'get_node_tree',
        {
          ...(nodeId ? { nodeId } : {}),
          maxDepth,
          ...(maxNodes !== undefined ? { maxNodes } : {}),
          ...(format ? { format } : {}),
        },
        file,
      );

      if (!result.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: true,
        };
      }

      if (format === 'xml') {
        return { content: [{ type: 'text', text: String(result.result ?? '') }] };
      }

      return fromEditResult(result);
    }
  );
}
