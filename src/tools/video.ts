import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { asRecord, failJson, fileParam, jsonText, pickString } from './shared.js';

const constraintSchema = z
  .object({
    type: z.enum(['SCALE', 'WIDTH', 'HEIGHT']),
    value: z.number().positive(),
  })
  .describe('Output size. SCALE accepts 0.5, 0.75, 1, 1.5, 2, 3, or 4; WIDTH/HEIGHT are capped at 4096px.');

export const exportVideoSchema = {
  nodeId: z
    .string()
    .regex(/^\d+[:-]\d+$/, 'Expected a node id such as "1:23" or "1-23".')
    .describe('Top-level frame or slide that owns the timeline. Nested layers are not supported by Figma MP4 export.'),
  fps: z.number().int().min(5).max(60).optional().default(30).describe('Frames per second (snapped to 12, 24, 30, or 60)'),
  quality: z.enum(['low', 'medium', 'high']).optional().default('high').describe('MP4 render quality preset'),
  constraint: constraintSchema.optional(),
  outputDir: z
    .string()
    .optional()
    .describe('Directory to write the MP4 to. Defaults to ~/.figma-mcp-unchained/exports/<timestamp>.'),
  inline: z.boolean().optional().default(false).describe('Include base64 MP4 data in the JSON response as well as the file'),
  file: fileParam,
};

const sanitizeFilename = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'timeline';

export function registerVideoTools(server: McpServer): void {
  server.tool(
    'export_video',
    'Export a top-level animated frame or slide as an MP4 through the Figma Plugin API. Writes the video to a local directory (the official server returns a temporary URL) and enforces a 100 MB local limit.',
    exportVideoSchema,
    async (args) => {
      const result = await executeEdit(
        'export_video',
        {
          nodeId: args.nodeId,
          fps: args.fps,
          quality: args.quality,
          ...(args.constraint ? { constraint: args.constraint } : {}),
        },
        args.file,
      );

      if (!result.ok) {
        return { content: [{ type: 'text', text: jsonText(result) }], isError: true };
      }

      const payload = asRecord(result.result) ?? {};
      const base64 = pickString(payload.base64);
      if (!base64) {
        return failJson('EXPORT_FAILED', 'The plugin did not return MP4 data.');
      }

      const name = pickString(payload.name) ?? args.nodeId.replace(':', '-');
      const filename = `${sanitizeFilename(`${name}-${args.nodeId.replace(':', '-')}`)}.mp4`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputDir = resolve(
        args.outputDir ?? join(homedir(), '.figma-mcp-unchained', 'exports', timestamp),
      );
      const outputPath = join(outputDir, filename);
      const bytes = Buffer.from(base64, 'base64');

      try {
        await mkdir(outputDir, { recursive: true });
        await writeFile(outputPath, bytes);
      } catch (error) {
        return failJson(
          'ASSET_WRITE_FAILED',
          `Could not write the exported video: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const file: Record<string, unknown> = {
        path: outputPath,
        format: 'mp4',
        mimeType: 'video/mp4',
        bytes: bytes.byteLength,
        nodeId: args.nodeId,
        fps: payload.fps ?? args.fps,
        quality: payload.quality ?? args.quality,
      };
      if (payload.width !== undefined) file.width = payload.width;
      if (payload.height !== undefined) file.height = payload.height;
      if (args.inline) file.base64 = base64;

      return {
        content: [
          {
            type: 'text',
            text: jsonText({
              outputDir,
              files: [file],
              warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
              limitations: Array.isArray(payload.limitations) ? payload.limitations : [],
            }),
          },
        ],
      };
    },
  );
}
