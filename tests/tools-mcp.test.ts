import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools, registeredToolNames } from '../src/tools/index.js';

const { executeEdit } = vi.hoisted(() => ({ executeEdit: vi.fn() }));

vi.mock('../src/bridge/queue.js', () => ({ executeEdit }));

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let server: McpServer;
let client: Client;
let dir: string;

const connect = async (): Promise<void> => {
  server = new McpServer({ name: 'figma-mcp-unchained-test', version: '0.0.0' });
  registerTools(server);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
};

const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });

const lastCall = () => executeEdit.mock.calls[executeEdit.mock.calls.length - 1] as [
  string,
  Record<string, unknown>,
  string | undefined,
];

beforeEach(async () => {
  executeEdit.mockReset();
  executeEdit.mockImplementation(async (type: string, payload: Record<string, unknown>, file?: string) => ({
    ok: true,
    result: { type, payload, file },
  }));
  dir = await mkdtemp(join(tmpdir(), 'figma-mcp-unchained-tools-'));
  await connect();
});

afterEach(async () => {
  await client.close();
  await server.close();
  await rm(dir, { recursive: true, force: true });
});

describe('MCP tool registration', () => {
  it('registers every supported tool with a description and object schema', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...registeredToolNames].sort());

    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('registers the design-system rules prompt', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual(['create_design_system_rules']);

    const result = await client.getPrompt({
      name: 'create_design_system_rules',
      arguments: { clientLanguages: 'typescript', clientFrameworks: 'react' },
    });
    const text = result.messages[0].content;
    expect(text.type).toBe('text');
    if (text.type === 'text') {
      expect(text.text).toContain('Languages: typescript');
      expect(text.text).toContain('Frameworks: react');
      expect(text.text).toContain('Token mapping');
    }
  });
});

describe('MCP tool payload routing', () => {
  it('routes use_figma and forwards the file selector', async () => {
    const result = await call('use_figma', {
      code: 'return 1',
      file: 'Design.fig',
      description: 'Smoke test',
      skillNames: 'ignored',
    });
    expect(result.isError).toBeFalsy();
    expect(lastCall()).toEqual(['use_figma', { code: 'return 1' }, 'Design.fig']);
  });

  it('routes get_screenshot with contentsOnly and maxDimension as export_node', async () => {
    executeEdit.mockResolvedValueOnce({
      ok: true,
      result: { id: '1:1', name: 'Card', format: 'PNG', base64: PNG_BASE64, byteLength: 4 },
    });

    const result = (await call('get_screenshot', {
      nodeId: '1:1',
      contentsOnly: true,
      maxDimension: 512,
      enableBase64Response: true,
    })) as { content: Array<{ type: string; data?: string; mimeType?: string }> };

    expect(lastCall()).toEqual([
      'export_node',
      { scale: 2, format: 'PNG', nodeId: '1:1', contentsOnly: true, maxDimension: 512 },
      undefined,
    ]);
    expect(result.content[0]).toMatchObject({ type: 'image', data: PNG_BASE64, mimeType: 'image/png' });
  });

  it('routes get_metadata with JSON and XML formats', async () => {
    await call('get_metadata', { nodeId: '1:1' });
    expect(lastCall()).toEqual(['get_node_tree', { nodeId: '1:1', maxDepth: 4 }, undefined]);

    executeEdit.mockResolvedValueOnce({ ok: true, result: '<frame id="1:1" />' });
    const xml = (await call('get_metadata', { nodeId: '1:1', format: 'xml' })) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(lastCall()).toEqual(['get_node_tree', { nodeId: '1:1', maxDepth: 4, format: 'xml' }, undefined]);
    expect(xml.content[0].text).toBe('<frame id="1:1" />');
  });

  it('routes get_variable_defs with defaults and optional caps', async () => {
    await call('get_variable_defs', { name: 'Card', maxNodes: 10 });
    expect(lastCall()).toEqual(['get_variable_defs', { name: 'Card', maxDepth: 8, maxNodes: 10 }, undefined]);
  });

  it('routes get_design_context and strips the screenshot into an image block', async () => {
    executeEdit.mockResolvedValueOnce({
      ok: true,
      result: {
        mode: 'local-structured',
        root: { id: '1:1' },
        screenshot: { base64: PNG_BASE64, mimeType: 'image/png', byteLength: 4 },
      },
    });

    const result = (await call('get_design_context', {
      nodeId: '1:1',
      excludeScreenshot: false,
      forceCode: true,
    })) as { content: Array<{ type: string; text?: string; data?: string }> };

    expect(lastCall()).toEqual([
      'get_design_context',
      {
        nodeId: '1:1',
        maxDepth: 6,
        includeVariables: true,
        includeStyles: true,
        excludeScreenshot: false,
        maxDimension: 1024,
        forceCode: true,
      },
      undefined,
    ]);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).not.toContain('base64');
    expect(result.content[1]).toMatchObject({ type: 'image', data: PNG_BASE64, mimeType: 'image/png' });
  });

  it('routes FigJam, motion, shader, library and diagram tools', async () => {
    await call('get_figjam', { nodeId: '2:1' });
    expect(lastCall()).toEqual([
      'get_figjam',
      { nodeId: '2:1', maxDepth: 10, includeImagesOfNodes: true },
      undefined,
    ]);

    await call('get_motion_context', { nodeId: '3:1' });
    expect(lastCall()).toEqual([
      'get_motion_context',
      { nodeId: '3:1', recursive: false, maxDepth: 10 },
      undefined,
    ]);

    await call('list_shaders', {});
    expect(lastCall()).toEqual(['list_shaders', {}, undefined]);

    await call('get_shader', { id: 'shader:1' });
    expect(lastCall()).toEqual(['get_shader', { id: 'shader:1' }, undefined]);

    await call('list_file_shaders', {});
    expect(lastCall()).toEqual(['list_file_shaders', { allPages: false }, undefined]);

    await call('get_libraries', {});
    expect(lastCall()).toEqual(['get_libraries', { includeVariables: false }, undefined]);

    await call('search_design_system', {
      queries: [{ entity: 'component', query: 'Button' }],
    });
    expect(lastCall()).toEqual([
      'search_design_system',
      { queries: [{ entity: 'component', query: 'Button' }], limit: 25, includeLibraryVariables: true },
      undefined,
    ]);

    await call('generate_diagram', { name: 'Flow', mermaidSyntax: 'graph LR\nA --> B' });
    expect(lastCall()).toEqual([
      'generate_diagram',
      { name: 'Flow', mermaidSyntax: 'graph LR\nA --> B' },
      undefined,
    ]);
  });

  it('routes export_video and writes an MP4 file', async () => {
    executeEdit.mockResolvedValueOnce({
      ok: true,
      result: {
        id: '1:1',
        name: 'Hero timeline',
        format: 'MP4',
        mimeType: 'video/mp4',
        fps: 30,
        quality: 'high',
        base64: Buffer.from([0, 0, 0, 24]).toString('base64'),
        byteLength: 4,
        warnings: [],
        limitations: ['local'],
      },
    });

    const result = (await call('export_video', {
      nodeId: '1:1',
      fps: 45,
      quality: 'high',
      constraint: { type: 'WIDTH', value: 1920 },
      outputDir: dir,
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(result.content[0].text) as {
      files: Array<{ path: string; format: string; bytes: number; fps: number; width?: number }>;
    };

    expect(lastCall()).toEqual([
      'export_video',
      { nodeId: '1:1', fps: 45, quality: 'high', constraint: { type: 'WIDTH', value: 1920 } },
      undefined,
    ]);
    expect(payload.files[0]).toMatchObject({ format: 'mp4', bytes: 4, fps: 30 });
    expect(payload.files[0].path.endsWith('.mp4')).toBe(true);
    expect(await readFile(payload.files[0].path)).toEqual(Buffer.from([0, 0, 0, 24]));
  });

  it('passes export_video plugin failures through', async () => {
    executeEdit.mockResolvedValueOnce({ ok: false, code: 'EXPORT_FAILED', error: 'not a top-level frame' });
    const result = (await call('export_video', { nodeId: '1:1' })) as {
      isError: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'EXPORT_FAILED' });
  });

  it('maps tool-level failures to isError results', async () => {
    executeEdit.mockResolvedValueOnce({ ok: false, code: 'NODE_NOT_FOUND', error: 'Missing node' });
    const result = (await call('get_design_context', { nodeId: '9:9' })) as {
      isError: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ ok: false, code: 'NODE_NOT_FOUND' });
  });
});

describe('MCP asset tools', () => {
  it('writes downloaded assets to the requested directory and reports paths', async () => {
    executeEdit.mockResolvedValueOnce({
      ok: true,
      result: {
        assets: [{ nodeId: '1:1', name: 'Card', format: 'png', mimeType: 'image/png', base64: PNG_BASE64 }],
        rawImages: [],
        svgAssets: [],
        warnings: [],
      },
    });

    const result = (await call('download_assets', { nodeId: '1:1', outputDir: dir })) as {
      content: Array<{ text: string }>;
    };
    const payload = JSON.parse(result.content[0].text) as {
      files: Array<{ path: string; kind: string; bytes: number }>;
      totalBytes: number;
    };

    expect(lastCall()).toEqual([
      'download_assets',
      { nodeIds: ['1:1'], includeRawImages: true, includeSvgAssets: true },
      undefined,
    ]);
    expect(payload.files[0]).toMatchObject({ kind: 'assets', bytes: Buffer.from(PNG_BASE64, 'base64').byteLength });
    expect(await readFile(payload.files[0].path)).toEqual(Buffer.from(PNG_BASE64, 'base64'));
    expect(payload.totalBytes).toBe(Buffer.from(PNG_BASE64, 'base64').byteLength);
  });

  it('can inline downloaded base64 data', async () => {
    executeEdit.mockResolvedValueOnce({
      ok: true,
      result: { assets: [{ name: 'Card.png', format: 'png', base64: PNG_BASE64 }], warnings: [] },
    });
    const result = (await call('download_assets', { outputDir: dir, inline: true })) as {
      content: Array<{ text: string }>;
    };
    const payload = JSON.parse(result.content[0].text) as { files: Array<{ base64: string }> };
    expect(payload.files[0].base64).toBe(PNG_BASE64);
  });

  it('loads uploads from a local path and sends base64 to the plugin', async () => {
    const path = join(dir, 'icon.png');
    await writeFile(path, Buffer.from(PNG_BASE64, 'base64'));

    await call('upload_assets', { assets: [{ path }] });

    const [type, payload] = lastCall();
    expect(type).toBe('upload_assets');
    expect(payload.assets).toEqual([
      { name: 'icon.png', mimeType: 'image/png', base64: PNG_BASE64, bytes: Buffer.from(PNG_BASE64, 'base64').byteLength },
    ]);
    expect(payload.scaleMode).toBe('FILL');
  });

  it('accepts data URLs and SVG assets', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" />').toString('base64');
    await call('upload_assets', { assets: [{ name: 'icon.svg', base64: `data:image/svg+xml;base64,${svg}` }] });
    const [, payload] = lastCall();
    expect(payload.assets).toEqual([
      { name: 'icon.svg', mimeType: 'image/svg+xml', base64: svg, bytes: Buffer.from(svg, 'base64').byteLength },
    ]);
  });

  it('maps the deprecated singular nodeId to nodeIds', async () => {
    await call('upload_assets', {
      assets: [{ name: 'a.png', base64: PNG_BASE64 }],
      nodeId: '1:1',
    });
    const [, payload] = lastCall();
    expect(payload.nodeIds).toEqual(['1:1']);
  });

  it('rejects bad targets before calling the plugin', async () => {
    const result = (await call('upload_assets', {
      assets: [{ name: 'a.png', base64: PNG_BASE64 }],
      nodeIds: ['1:1', '1:2'],
    })) as { isError: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'INVALID_ASSET_TARGETS' });
    expect(executeEdit).not.toHaveBeenCalled();
  });

  it('reports unreadable upload paths without calling the plugin', async () => {
    const result = (await call('upload_assets', {
      assets: [{ path: join(dir, 'missing.png') }],
    })) as { isError: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'ASSET_READ_FAILED' });
    expect(executeEdit).not.toHaveBeenCalled();
  });

  it('rejects unsupported asset types', async () => {
    const result = (await call('upload_assets', {
      assets: [{ name: 'notes.txt', base64: Buffer.from('hello').toString('base64') }],
    })) as { isError: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'UNSUPPORTED_ASSET_TYPE' });
  });

  it('rejects invalid base64', async () => {
    const result = (await call('upload_assets', {
      assets: [{ name: 'bad.png', base64: 'not base64!@#' }],
    })) as { isError: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'INVALID_ASSET' });
  });

  it('enforces the per-asset size cap', async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
    const result = (await call('upload_assets', {
      assets: [{ name: 'big.png', base64: oversized }],
    })) as { isError: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'ASSET_TOO_LARGE' });
  });

  it('reports filesystem write failures', async () => {
    executeEdit.mockResolvedValueOnce({
      ok: true,
      result: { assets: [{ name: 'Card.png', format: 'png', base64: PNG_BASE64 }], warnings: [] },
    });
    const result = (await call('download_assets', {
      outputDir: join(dir, 'not-a-directory'),
    })) as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBeFalsy();

    await writeFile(join(dir, 'blocked'), 'file');
    const blocked = (await call('download_assets', {
      outputDir: join(dir, 'blocked', 'nested'),
    })) as { isError: boolean; content: Array<{ text: string }> };
    expect(blocked.isError).toBe(true);
    expect(JSON.parse(blocked.content[0].text)).toMatchObject({ code: 'ASSET_WRITE_FAILED' });
  });
});
