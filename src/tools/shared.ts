import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { EditResult } from '../types/commands.js';

export const FILE_DESCRIPTION =
  'File name or session id. Required only when several plugins are connected.';

export const fileParam = z.string().optional().describe(FILE_DESCRIPTION);

export const nodeIdParam = z
  .string()
  .regex(/^\d+[:-]\d+$/, 'Expected a node id such as "1:23" or "1-23".')
  .optional()
  .describe('Node id to target. If omitted, uses the current selection or current page.');

export const MAX_TEXT_CHARS = 2_000;
export const MAX_TREE_NODES = 5_000;

export const truncateText = (value: unknown, limit = MAX_TEXT_CHARS): string | undefined => {
  if (typeof value !== 'string') return undefined;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
};

export const jsonText = (value: unknown): string => JSON.stringify(value, null, 2);

export const okJson = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: jsonText(value) }],
});

export const failJson = (code: string, error: string): CallToolResult => ({
  content: [{ type: 'text', text: jsonText({ ok: false, code, error }) }],
  isError: true,
});

export const fromEditResult = (result: EditResult): CallToolResult => {
  if (!result.ok) {
    return {
      content: [{ type: 'text', text: jsonText(result) }],
      isError: true,
    };
  }
  return okJson(result.result);
};

export const withImage = (result: CallToolResult, base64: string, mimeType: string): CallToolResult => ({
  ...result,
  content: [...result.content, { type: 'image', data: base64, mimeType }],
});

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

export const pickString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export const pickBase64 = (value: unknown): string | undefined => pickString(value);
