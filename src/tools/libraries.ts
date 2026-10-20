import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { fileParam, fromEditResult } from './shared.js';

export const getLibrariesSchema = {
  includeVariables: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include variable names for each enabled library variable collection'),
  maxCollections: z.number().int().positive().max(200).optional().describe('Maximum library collections to read'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Accepted for compatibility. Local results are not paginated.'),
  file: fileParam,
};

export const searchDesignSystemSchema = {
  queries: z
    .array(
      z.object({
        entity: z.enum(['component', 'variable', 'style']),
        query: z.string().min(1),
      }),
    )
    .min(1)
    .max(20)
    .describe('One search per asset type. Each entry is {"entity","query"} — never a bare string.'),
  limit: z.number().int().positive().max(100).optional().default(25).describe('Maximum results per query'),
  includeLibraryVariables: z
    .boolean()
    .optional()
    .default(true)
    .describe('Search variables in enabled library collections'),
  fileKey: z.string().optional().describe('Accepted for official client compatibility; ignored because the open file is used'),
  disableCodeConnect: z.boolean().optional().describe('Accepted for compatibility; Code Connect is unavailable locally'),
  includeLibraryKeys: z
    .array(z.string())
    .optional()
    .describe('Accepted for compatibility; component/style library catalogs are unavailable to the Plugin API'),
  file: fileParam,
};

export function registerLibraryTools(server: McpServer): void {
  server.tool(
    'get_libraries',
    'List design-system sources visible to the open file: enabled library variable collections, local variable collections, and local style/component counts. The Plugin API cannot enumerate subscribed component/style libraries or available Community/organization libraries.',
    getLibrariesSchema,
    async ({ includeVariables, maxCollections, file }) =>
      fromEditResult(
        await executeEdit(
          'get_libraries',
          { includeVariables, ...(maxCollections !== undefined ? { maxCollections } : {}) },
          file,
        ),
      )
  );

  server.tool(
    'search_design_system',
    'Search local components, variables, and styles plus variables in enabled library collections. This is a local approximation: the Plugin API cannot enumerate or search library components/styles by name.',
    searchDesignSystemSchema,
    async ({ queries, limit, includeLibraryVariables, file }) =>
      fromEditResult(
        await executeEdit(
          'search_design_system',
          { queries, limit, includeLibraryVariables },
          file,
        ),
      )
  );
}
