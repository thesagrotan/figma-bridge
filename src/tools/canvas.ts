import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';

export function registerCanvasTools(server: McpServer): void {
  server.tool(
    'use_figma',
    'Execute JavaScript code using Figma Plugin API in document context.',
    {
      code: z.string().describe('JavaScript code using Figma Plugin API to execute in document context'),
      skillNames: z.string().optional().describe('Accepted for compatibility with Figma clients and ignored'),
      file: z.string().optional().describe('File name or session id. Required only when several plugins are connected.'),
    },
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
    {
      nodeId: z.string().optional().describe('Node ID to capture. If omitted, captures selection or current page.'),
      name: z.string().optional().describe('Node name to capture.'),
      file: z.string().optional().describe('File name or session id. Required only when several plugins are connected.'),
    },
    async ({ nodeId, name, file }) => {
      const result = await executeEdit(
        'export_node',
        {
          scale: 2,
          format: 'PNG',
          ...(nodeId ? { nodeId } : {}),
          ...(name ? { name } : {}),
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
    'Inspect document metadata or traverse a node tree hierarchy.',
    {
      nodeId: z.string().optional().describe('Node ID to inspect. If omitted, returns document / current page metadata.'),
      maxDepth: z.number().optional().default(4).describe('Maximum tree depth to traverse'),
      file: z.string().optional().describe('File name or session id. Required only when several plugins are connected.'),
    },
    async ({ nodeId, maxDepth, file }) => {
      const result = await executeEdit(
        'get_node_tree',
        {
          ...(nodeId ? { nodeId } : {}),
          maxDepth,
        },
        file,
      );

      if (!result.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result.result, null, 2) }],
      };
    }
  );
}
