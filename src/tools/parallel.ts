import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { applyVariation, discardNode, explore } from '../parallel/pipeline.js';

const stripBase64 = <T extends { previews: { originalBase64: string | null; previews: Array<{ imageBase64: string | null }> } }>(result: T) => ({
  ...result,
  previews: {
    ...result.previews,
    originalBase64: result.previews.originalBase64 ? '[image returned separately]' : null,
    previews: result.previews.previews.map((p) => ({ ...p, imageBase64: p.imageBase64 ? '[image returned separately]' : null })),
  },
});

export function registerParallelTools(server: McpServer): void {
  server.tool(
    'parallel_explore',
    'PARALLEL: inspect the selected Figma component and generate three visual directions (refine, reinterpret, mutate) with rendered previews. Returns the normalized snapshot, the variations, and images for the original plus each direction.',
    {
      nodeId: z.string().optional().describe('Node id to explore. Defaults to the current selection.'),
      name: z.string().optional().describe('Node name to explore when no id is available.'),
      scale: z.number().min(0.5).max(4).default(2).describe('Preview render scale.'),
    },
    async ({ nodeId, name, scale }) => {
      try {
        const result = await explore(executeEdit, { nodeId, name, scale });
        const summary = stripBase64(result);

        const blocks: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
          { type: 'text', text: JSON.stringify(summary, null, 2) },
          { type: 'text', text: 'Preview order: 1) original, 2) refine, 3) reinterpret, 4) mutate' },
        ];

        if (result.previews.originalBase64) {
          blocks.push({ type: 'image', data: result.previews.originalBase64, mimeType: 'image/png' });
        }
        for (const preview of result.previews.previews) {
          if (preview.status === 'ready' && preview.imageBase64) {
            blocks.push({ type: 'image', data: preview.imageBase64, mimeType: 'image/png' });
          }
        }

        return { content: blocks };
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'parallel_apply',
    'PARALLEL: apply a previously generated variation to a NEW duplicate of the component. The original is never modified. Requires explicit confirmation.',
    {
      variationId: z.string().min(1).describe('Variation id returned by parallel_explore, e.g. "refine:1:23".'),
      confirm: z.boolean().describe('Must be true. Confirms you intend to duplicate and mutate the component.'),
    },
    async ({ variationId, confirm }) => {
      try {
        const applied = await applyVariation(executeEdit, { variationId, approved: confirm === true });
        return { content: [{ type: 'text', text: JSON.stringify(applied, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'parallel_discard',
    'PARALLEL: delete a node created by parallel_apply, reverting the exploration to the state before it was applied.',
    {
      nodeId: z.string().min(1).describe('The createdNodeId returned by parallel_apply.'),
    },
    async ({ nodeId }) => {
      try {
        const result = await discardNode(executeEdit, nodeId);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: !result.discarded };
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2) }],
          isError: true,
        };
      }
    },
  );
}
