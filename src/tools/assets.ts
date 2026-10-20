import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { z } from 'zod';
import { executeEdit } from '../bridge/queue.js';
import { asRecord, failJson, fileParam, jsonText, pickString } from './shared.js';

const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_DOWNLOAD_BYTES = 25 * 1024 * 1024;

const EXPORT_FORMATS = ['png', 'jpg', 'svg', 'pdf'] as const;
const RASTER_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
const ALL_MIME_TYPES = [...RASTER_MIME_TYPES, 'image/svg+xml'] as const;

export const downloadAssetsSchema = {
  nodeId: z.string().optional().describe('Single node id to download'),
  nodeIds: z.array(z.string()).max(20).optional().describe('Up to 20 node ids to download'),
  name: z.string().optional().describe('Node name to target when no node id is provided'),
  defaultFormat: z.enum(EXPORT_FORMATS).optional().describe('Override the node export format'),
  defaultScale: z.number().min(0.01).max(4).optional().describe('Override the export scale'),
  includeRawImages: z.boolean().optional().default(true).describe('Include original image fills found in the subtree'),
  includeSvgAssets: z.boolean().optional().default(true).describe('Include SVG exports of vector-like nodes'),
  maxDimension: z.number().int().positive().max(65_536).optional().describe('Cap raster export dimensions'),
  outputDir: z
    .string()
    .optional()
    .describe('Directory to write downloaded files to. Defaults to ~/.figma-mcp-unchained/downloads/<timestamp>.'),
  inline: z.boolean().optional().default(false).describe('Include base64 data in the JSON response as well as files'),
  file: fileParam,
};

const uploadAssetSchema = z.object({
  name: z.string().optional(),
  mimeType: z.enum(ALL_MIME_TYPES).optional(),
  base64: z.string().optional(),
  path: z.string().optional(),
});

export const uploadAssetsSchema = {
  assets: z.array(uploadAssetSchema).min(1).max(60).describe('Assets to upload as base64 or local file paths'),
  nodeIds: z
    .array(z.string())
    .max(60)
    .optional()
    .describe('Target node ids, one per asset, for raster image fills'),
  nodeId: z
    .string()
    .optional()
    .describe('Deprecated singular target for a single raster asset; use nodeIds'),
  currentPageId: z
    .string()
    .optional()
    .describe('Accepted for compatibility. The open file and its current page are always used.'),
  batchCommit: z
    .boolean()
    .optional()
    .describe('Accepted for compatibility. Uploads are committed immediately.'),
  parentId: z.string().optional().describe('Container to append new layers to. Defaults to the current page.'),
  x: z.number().optional().describe('X position for newly created layers'),
  y: z.number().optional().describe('Y position for newly created layers'),
  scaleMode: z.enum(['FILL', 'FIT', 'TILE']).optional().default('FILL').describe('Raster fill scale mode'),
  file: fileParam,
};

const extensionForMime = (mimeType: string): string => {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
};

const mimeForFormat = (format: string): string => {
  switch (format.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
};

const sniffMime = (bytes: Buffer, name?: string): string | null => {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF87a') return 'image/gif';
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  const head = bytes.subarray(0, 512).toString('utf8').trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml';
  }
  const ext = name ? extname(name).toLowerCase() : '';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return null;
};

const sanitizeFilename = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'asset';

const decodeBase64 = (input: string): Buffer | null => {
  const payload = input.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(payload)) return null;
  return Buffer.from(payload, 'base64');
};

type LoadedAsset = { name: string; mimeType: string; base64: string; bytes: number };

const loadUploadAssets = async (
  assets: Array<{ name?: string; mimeType?: string; base64?: string; path?: string }>,
): Promise<{ ok: true; assets: LoadedAsset[] } | { ok: false; code: string; error: string }> => {
  const loaded: LoadedAsset[] = [];
  let total = 0;

  for (let index = 0; index < assets.length; index++) {
    const asset = assets[index];
    if (!asset.base64 && !asset.path) {
      return { ok: false, code: 'INVALID_ASSET', error: `Asset ${index} needs either base64 or path.` };
    }

    let bytes: Buffer;
    let name = asset.name;
    try {
      if (asset.path) {
        bytes = await readFile(asset.path);
        name ??= basename(asset.path);
      } else {
        const decoded = decodeBase64(asset.base64 ?? '');
        if (!decoded) {
          return { ok: false, code: 'INVALID_ASSET', error: `Asset ${index} is not valid base64.` };
        }
        bytes = decoded;
      }
    } catch (error) {
      return {
        ok: false,
        code: 'ASSET_READ_FAILED',
        error: `Could not read asset ${index}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (bytes.byteLength > MAX_ASSET_BYTES) {
      return {
        ok: false,
        code: 'ASSET_TOO_LARGE',
        error: `Asset ${index} is ${bytes.byteLength} bytes; the local limit is ${MAX_ASSET_BYTES} bytes.`,
      };
    }
    total += bytes.byteLength;
    if (total > MAX_TOTAL_UPLOAD_BYTES) {
      return {
        ok: false,
        code: 'ASSET_TOO_LARGE',
        error: `The upload batch exceeds the local ${MAX_TOTAL_UPLOAD_BYTES}-byte limit.`,
      };
    }

    const mimeType = asset.mimeType ?? sniffMime(bytes, name) ?? null;
    if (!mimeType) {
      return {
        ok: false,
        code: 'UNSUPPORTED_ASSET_TYPE',
        error: `Asset ${index} is not a supported PNG, JPG, GIF, WebP, or SVG file.`,
      };
    }
    if (!ALL_MIME_TYPES.includes(mimeType as (typeof ALL_MIME_TYPES)[number])) {
      return {
        ok: false,
        code: 'UNSUPPORTED_ASSET_TYPE',
        error: `Asset ${index} has unsupported MIME type ${mimeType}.`,
      };
    }

    name ??= `asset-${index + 1}.${extensionForMime(mimeType)}`;
    loaded.push({ name, mimeType, base64: bytes.toString('base64'), bytes: bytes.byteLength });
  }

  return { ok: true, assets: loaded };
};

const writeDownloadedAssets = async (
  result: Record<string, unknown>,
  outputDir: string,
  inline: boolean,
): Promise<Record<string, unknown>> => {
  const files: Array<Record<string, unknown>> = [];
  let total = 0;
  const used = new Set<string>();

  const targetDir = resolve(outputDir);
  await mkdir(targetDir, { recursive: true });

  const collections: Array<{ key: string; value: unknown }> = [
    { key: 'assets', value: result.assets },
    { key: 'rawImages', value: result.rawImages },
    { key: 'svgAssets', value: result.svgAssets },
  ];

  for (const collection of collections) {
    if (!Array.isArray(collection.value)) continue;
    for (const entry of collection.value) {
      const record = asRecord(entry);
      const base64 = pickString(record?.base64);
      if (!record || !base64) continue;
      const format = pickString(record.format) ?? 'bin';
      const mimeType = pickString(record.mimeType) ?? mimeForFormat(format);
      const rawName =
        pickString(record.name) ??
        pickString(record.hash) ??
        `${collection.key}-${files.length + 1}`;
      const base = sanitizeFilename(`${rawName}.${extensionForMime(mimeType)}`);
      let filename = base;
      let suffix = 2;
      while (used.has(filename)) {
        filename = `${base.replace(/(\.[^.]+)$/, '')}-${suffix++}$1`;
      }
      used.add(filename);

      const bytes = Buffer.from(base64, 'base64');
      total += bytes.byteLength;
      if (total > MAX_TOTAL_DOWNLOAD_BYTES) {
        return {
          outputDir: targetDir,
          files,
          truncated: true,
          warning: `Stopped writing at the local ${MAX_TOTAL_DOWNLOAD_BYTES}-byte download limit.`,
        };
      }

      const path = join(targetDir, filename);
      await writeFile(path, bytes);

      const file: Record<string, unknown> = {
        path,
        kind: collection.key,
        format,
        mimeType,
        bytes: bytes.byteLength,
        ...(pickString(record.nodeId) ? { nodeId: record.nodeId } : {}),
        ...(pickString(record.hash) ? { hash: record.hash } : {}),
        ...(Array.isArray(record.usedByNodeIds) ? { usedByNodeIds: record.usedByNodeIds } : {}),
      };
      if (inline) file.base64 = base64;
      files.push(file);
    }
  }

  return {
    outputDir: targetDir,
    files,
    totalBytes: total,
    truncated: result.truncated === true,
    rawImagesTruncated: result.rawImagesTruncated === true,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  };
};

export function registerAssetTools(server: McpServer): void {
  server.tool(
    'download_assets',
    'Download export renders, original image fills, and SVG assets from the open file. Writes files to a local directory (no temporary public URLs) and enforces local count/size caps.',
    downloadAssetsSchema,
    async (args) => {
      const nodeIds = [
        ...(args.nodeId ? [args.nodeId] : []),
        ...(args.nodeIds ?? []),
      ];
      if (nodeIds.length > 20) {
        return failJson('INVALID_ARGUMENT', 'At most 20 node ids can be downloaded per call.');
      }

      const result = await executeEdit(
        'download_assets',
        {
          ...(nodeIds.length > 0 ? { nodeIds } : {}),
          ...(args.name ? { name: args.name } : {}),
          ...(args.defaultFormat ? { defaultFormat: args.defaultFormat } : {}),
          ...(args.defaultScale !== undefined ? { defaultScale: args.defaultScale } : {}),
          includeRawImages: args.includeRawImages,
          includeSvgAssets: args.includeSvgAssets,
          ...(args.maxDimension !== undefined ? { maxDimension: args.maxDimension } : {}),
        },
        args.file,
      );

      if (!result.ok) {
        return { content: [{ type: 'text', text: jsonText(result) }], isError: true };
      }

      const payload = asRecord(result.result) ?? {};
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputDir =
        args.outputDir ?? join(homedir(), '.figma-mcp-unchained', 'downloads', timestamp);

      try {
        const written = await writeDownloadedAssets(payload, outputDir, args.inline);
        return { content: [{ type: 'text', text: jsonText(written) }] };
      } catch (error) {
        return failJson(
          'ASSET_WRITE_FAILED',
          `Could not write downloaded assets: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  );

  server.tool(
    'upload_assets',
    'Upload images and SVGs into the open file. Accepts base64 or local file paths. Rasters become image fills (optionally on target nodes); SVGs become editable vector layers. Max 10 MB per asset and 60 assets per call.',
    uploadAssetsSchema,
    async (args) => {
      if (args.nodeId && args.nodeIds) {
        return failJson('INVALID_ASSET_TARGETS', 'Use either nodeId or nodeIds, not both.');
      }
      if (args.nodeId && args.assets.length !== 1) {
        return failJson('INVALID_ASSET_TARGETS', 'nodeId can only be used with a single asset; use nodeIds.');
      }
      const targetIds = args.nodeId ? [args.nodeId] : args.nodeIds;
      if (targetIds && targetIds.length !== args.assets.length) {
        return failJson(
          'INVALID_ASSET_TARGETS',
          'nodeIds must contain exactly one target per asset, in the same order.',
        );
      }

      const loaded = await loadUploadAssets(args.assets);
      if (!loaded.ok) return failJson(loaded.code, loaded.error);

      const result = await executeEdit(
        'upload_assets',
        {
          assets: loaded.assets,
          ...(targetIds ? { nodeIds: targetIds } : {}),
          ...(args.parentId ? { parentId: args.parentId } : {}),
          ...(args.x !== undefined ? { x: args.x } : {}),
          ...(args.y !== undefined ? { y: args.y } : {}),
          scaleMode: args.scaleMode,
        },
        args.file,
      );

      if (!result.ok) {
        return { content: [{ type: 'text', text: jsonText(result) }], isError: true };
      }
      return { content: [{ type: 'text', text: jsonText(result.result) }] };
    }
  );
}
