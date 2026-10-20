import { describe, expect, it } from 'vitest';
import { createHarness, type NodeSpec } from './fakeFigma.js';

const cardSpec = (): NodeSpec => ({
  id: '1:100',
  name: 'Revenue Card',
  type: 'COMPONENT',
  width: 320,
  height: 180,
  fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
  strokes: [],
  strokeWeight: 0,
  cornerRadius: 6,
  layoutMode: 'VERTICAL',
  itemSpacing: 14,
  paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
  primaryAxisAlignItems: 'MIN',
  counterAxisAlignItems: 'MIN',
  layoutSizingHorizontal: 'FIXED',
  layoutSizingVertical: 'HUG',
  children: [
    {
      id: '1:101', name: 'Title', type: 'TEXT', width: 120, height: 18,
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 }, opacity: 1 }],
      characters: 'Monthly revenue',
      fontSize: 13,
      fontName: { family: 'Inter', style: 'Regular' },
      lineHeight: { unit: 'PIXELS', value: 18 },
      letterSpacing: { unit: 'PIXELS', value: 0 },
      textAlignHorizontal: 'LEFT',
    },
    {
      id: '1:102', name: 'Body', type: 'FRAME', width: 288, height: 118,
      fills: [{ type: 'SOLID', color: { r: 0.11, g: 0.12, b: 0.16 }, opacity: 1 }],
      cornerRadius: 6, layoutMode: 'NONE',
    },
  ],
});

const command = (type: string, payload: Record<string, unknown> = {}) => ({ id: `cmd-${type}`, type, payload });

describe('plugin/code.js use_figma', () => {
  it('runs async code with top-level await and returns the value', async () => {
    const harness = createHarness([cardSpec()]);
    const result = await harness.execute(
      command('use_figma', {
        code: `
          await ensureFontLoaded({ family: 'Inter', style: 'Regular' });
          const value = await Promise.resolve(42);
          return { value, page: figma.currentPage.name, file: figma.root.name };
        `,
      }),
    );

    expect(result).toEqual({ value: 42, page: 'Page 1', file: 'Test File' });
  });

  it('rejects empty code', async () => {
    const harness = createHarness([cardSpec()]);
    await expect(harness.execute(command('use_figma', { code: '   ' }))).rejects.toThrow(/No code provided/i);
  });
});

describe('plugin/code.js get_node_tree', () => {
  it('serializes a node subtree with layout, paints and typography', async () => {
    const harness = createHarness([cardSpec()]);
    const tree = (await harness.execute(command('get_node_tree', { nodeId: '1:100', maxDepth: 4 }))) as {
      id: string;
      children: Array<{ name: string }>;
      cornerRadius: number;
      layoutMode: string;
      itemSpacing: number;
    };

    expect(tree.id).toBe('1:100');
    expect(tree.cornerRadius).toBe(6);
    expect(tree.layoutMode).toBe('VERTICAL');
    expect(tree.itemSpacing).toBe(14);
    expect(tree.children).toHaveLength(2);
    expect(tree.children.map((child) => child.name)).toEqual(['Title', 'Body']);

    const title = (await harness.execute(command('get_node_tree', { nodeId: '1:101', maxDepth: 1 }))) as {
      characters: string;
      fontName: { family: string; style: string };
    };
    expect(title.characters).toBe('Monthly revenue');
    expect(title.fontName).toEqual({ family: 'Inter', style: 'Regular' });
  });

  it('honours maxDepth', async () => {
    const nested: NodeSpec = {
      id: '2:1',
      name: 'Outer',
      type: 'FRAME',
      children: [
        {
          id: '2:2',
          name: 'Inner',
          type: 'FRAME',
          children: [{ id: '2:3', name: 'Leaf', type: 'TEXT' }],
        },
      ],
    };
    const harness = createHarness([nested]);
    const shallow = (await harness.execute(command('get_node_tree', { nodeId: '2:1', maxDepth: 1 }))) as {
      children: Array<{ children?: unknown }>;
    };
    expect(shallow.children).toHaveLength(1);
    expect(shallow.children[0].children).toBeUndefined();
  });

  it('resolves by name and falls back to the current selection', async () => {
    const harness = createHarness([cardSpec()]);
    const byName = (await harness.execute(command('get_node_tree', { name: 'Body', maxDepth: 1 }))) as { id: string };
    expect(byName.id).toBe('1:102');

    const selected = (await harness.execute(command('get_node_tree', { maxDepth: 1 }))) as { id: string };
    expect(selected.id).toBe('1:100');
  });

  it('reports an explicit missing node clearly', async () => {
    const harness = createHarness([cardSpec()]);
    await expect(harness.execute(command('get_node_tree', { nodeId: '9:99' }))).rejects.toThrow(/not found/i);
  });
});

describe('plugin/code.js export_node', () => {
  it('exports an explicit node as a 2x PNG', async () => {
    const harness = createHarness([cardSpec()]);
    const result = (await harness.execute(command('export_node', { nodeId: '1:100', format: 'PNG', scale: 2 }))) as {
      id: string;
      name: string;
      format: string;
      base64: string;
      byteLength: number;
    };

    expect(result.id).toBe('1:100');
    expect(result.name).toBe('Revenue Card');
    expect(result.format).toBe('PNG');
    expect(result.base64).toBe(Buffer.from([137, 80, 78, 71]).toString('base64'));
    expect(result.byteLength).toBe(4);
    expect(harness.exportCount()).toBe(1);
  });

  it('exports by name and falls back to selection or page', async () => {
    const harness = createHarness([cardSpec()]);

    const byName = (await harness.execute(command('export_node', { name: 'Body', format: 'PNG', scale: 1 }))) as { id: string };
    expect(byName.id).toBe('1:102');

    const selected = (await harness.execute(command('export_node', { format: 'PNG', scale: 1 }))) as { id: string };
    expect(selected.id).toBe('1:100');

    harness.selection.length = 0;
    const page = (await harness.execute(command('export_node', { format: 'PNG', scale: 1 }))) as { id: string };
    expect(page.id).toBe('0:1');
  });

  it('fails closed when an explicit node id does not resolve', async () => {
    const harness = createHarness([cardSpec()]);
    await expect(harness.execute(command('export_node', { nodeId: '9:99', format: 'PNG', scale: 1 }))).rejects.toThrow(/not found/i);
    await expect(harness.execute(command('export_node', { name: 'Missing', format: 'PNG', scale: 1 }))).rejects.toThrow(/not found/i);
    expect(harness.exportCount()).toBe(0);
  });
});

describe('plugin/code.js command surface', () => {
  it('rejects unknown and removed command types', async () => {
    const harness = createHarness([cardSpec()]);
    await expect(harness.execute(command('teleport'))).rejects.toThrow(/Unknown command type/i);
    await expect(harness.execute(command('eval', { code: 'return 1' }))).rejects.toThrow(/Unknown command type/i);
    await expect(harness.execute(command('inspect', { nodeId: '1:100' }))).rejects.toThrow(/Unknown command type/i);
  });

  it('only exposes the three supported command branches', async () => {
    const harness = createHarness([cardSpec()]);
    for (const type of ['use_figma', 'get_node_tree', 'export_node']) {
      const result = await harness.execute(command(type, { code: 'return 1', nodeId: '1:100', format: 'PNG', scale: 1 }));
      expect(result).toBeDefined();
    }
  });
});

describe('plugin/code.js session and UI messages', () => {
  it('announces its session and answers get_session', async () => {
    const harness = createHarness([cardSpec()]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.messages.length = 0;

    await harness.onMessage({ type: 'get_session' });
    const [session] = harness.messages;

    expect(session.type).toBe('session');
    expect(session.fileName).toBe('Test File');
    expect(session.pageName).toBe('Page 1');
    expect(String(session.sessionId)).toMatch(/^sess-[a-z0-9]+$/);
  });

  it('persists the token and port from the UI', async () => {
    const harness = createHarness([cardSpec()]);
    await harness.onMessage({ type: 'save_storage', token: 'ui-token', port: '3005' });

    expect(harness.storage.get('figma_mcp_bridge_token')).toBe('ui-token');
    expect(harness.storage.get('figma_mcp_bridge_port')).toBe('3005');
  });

  it('suppresses results for cancelled or expired commands', async () => {
    const harness = createHarness([cardSpec()]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.messages.length = 0;

    await harness.onMessage({ type: 'cancel', id: 'cancelled' });
    await harness.onMessage({ type: 'execute', command: { id: 'cancelled', type: 'use_figma', payload: { code: 'return 1' } } });

    await harness.onMessage({
      type: 'execute',
      command: { id: 'expired', type: 'use_figma', payload: { code: 'return 2' }, expiresAt: Date.now() - 1 },
    });

    await harness.onMessage({ type: 'execute', command: { id: 'live', type: 'use_figma', payload: { code: 'return 3' } } });

    const results = harness.messages.filter((message) => message.type === 'result');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('live');
  });

  it('drops a result when cancellation arrives mid-execution', async () => {
    const harness = createHarness([cardSpec()]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    harness.messages.length = 0;

    const pending = harness.onMessage({
      type: 'execute',
      command: { id: 'slow', type: 'use_figma', payload: { code: 'await new Promise((r) => setTimeout(r, 25)); return 1;' } },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await harness.onMessage({ type: 'cancel', id: 'slow' });
    await pending;

    expect(harness.messages.filter((message) => message.type === 'result')).toHaveLength(0);
  });
});

describe('plugin/ui.html', () => {
  it('asks for the bridge token and persists it, with no default token', () => {
    const html = require('node:fs').readFileSync(new URL('../plugin/ui.html', import.meta.url), 'utf8');
    expect(html).toContain('id="token"');
    expect(html).toContain('id="save"');
    expect(html).toContain('save_storage');
    expect(html).toContain('get_session');
    expect(html).toContain('type: "hello"');
  });

  it('opens a compact plugin window', () => {
    const harness = createHarness([cardSpec()]);
    expect(harness.showUI).toEqual({ width: 320, height: 96 });
  });
});
