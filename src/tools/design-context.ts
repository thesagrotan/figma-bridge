import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { asRecord, fileParam, jsonText, pickString, withImage } from './shared.js';

export const getDesignContextSchema = {
  nodeId: z.string().optional().describe('Node id to inspect. Defaults to the current selection or page.'),
  name: z.string().optional().describe('Node name to inspect when nodeId is not provided.'),
  maxDepth: z.number().int().min(0).max(20).optional().default(6).describe('Maximum subtree depth'),
  maxNodes: z.number().int().positive().max(5_000).optional().describe('Maximum number of nodes to serialize'),
  includeVariables: z.boolean().optional().default(true).describe('Include resolved variable bindings'),
  includeStyles: z.boolean().optional().default(true).describe('Include applied style names and keys'),
  excludeScreenshot: z.boolean().optional().default(false).describe('Exclude the rendered PNG from the response'),
  maxDimension: z.number().int().positive().max(65_536).optional().default(1024).describe('Maximum screenshot edge'),
  clientLanguages: z.string().optional().describe('Accepted for official client compatibility; informational only'),
  clientFrameworks: z.string().optional().describe('Accepted for official client compatibility; informational only'),
  forceCode: z
    .boolean()
    .optional()
    .describe('Accepted for compatibility. Local structured context is always returned; no proprietary codegen exists.'),
  disableCodeConnect: z.boolean().optional().describe('Accepted for compatibility. Code Connect is unavailable locally.'),
  skillNames: z.string().optional().describe('Accepted for compatibility with Figma clients; ignored'),
  file: fileParam,
};

export function registerDesignContextTools(server: McpServer): void {
  server.tool(
    'get_design_context',
    'Return a bounded, structured design context for a node: layout, paints, typography, component metadata, variables/styles, a summary, and an optional PNG. This is a local structured approximation of Figma\'s proprietary code generation, not React/Tailwind output.',
    getDesignContextSchema,
    async ({
      nodeId,
      name,
      maxDepth,
      maxNodes,
      includeVariables,
      includeStyles,
      excludeScreenshot,
      maxDimension,
      clientLanguages,
      clientFrameworks,
      forceCode,
      disableCodeConnect,
      file,
    }) => {
      const result = await executeEdit(
        'get_design_context',
        {
          ...(nodeId ? { nodeId } : {}),
          ...(name ? { name } : {}),
          maxDepth,
          ...(maxNodes !== undefined ? { maxNodes } : {}),
          includeVariables,
          includeStyles,
          excludeScreenshot,
          maxDimension,
          ...(clientLanguages ? { clientLanguages } : {}),
          ...(clientFrameworks ? { clientFrameworks } : {}),
          ...(forceCode !== undefined ? { forceCode } : {}),
          ...(disableCodeConnect !== undefined ? { disableCodeConnect } : {}),
        },
        file,
      );

      if (!result.ok) {
        return {
          content: [{ type: 'text', text: jsonText(result) }],
          isError: true,
        };
      }

      const payload = asRecord(result.result);
      const screenshot = asRecord(payload?.screenshot);
      const base64 = pickString(screenshot?.base64);
      const mimeType = pickString(screenshot?.mimeType) ?? 'image/png';

      let text = payload;
      if (payload) {
        const { screenshot: _screenshot, ...rest } = payload;
        text = rest;
      }

      const content: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: jsonText(text) },
      ];
      const base = { content };

      if (!base64) return base;
      return withImage(base, base64, mimeType);
    }
  );
}
