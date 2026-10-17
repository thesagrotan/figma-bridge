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
      id: '1:102', name: 'Panel', type: 'FRAME', width: 288, height: 118,
      fills: [{ type: 'SOLID', color: { r: 0.11, g: 0.12, b: 0.16 }, opacity: 1 }],
      cornerRadius: 6, layoutMode: 'NONE',
    },
  ],
});

const command = (type: string, payload: Record<string, unknown>) => ({ id: `cmd-${type}`, type, payload });

describe('plugin/code.js node operations (fake Figma API)', () => {
  it('serializes a snapshot subtree with layout, paints and typography', async () => {
    const harness = createHarness([cardSpec()]);
    const snapshot = (await harness.execute(command('parallel_snapshot', { nodeId: '1:100' }))) as {
      root: { id: string; children: unknown[]; cornerRadius: number; layoutMode: string; itemSpacing: number };
      context: { pageName: string; selectionIds: string[] };
    };

    expect(snapshot.root.id).toBe('1:100');
    expect(snapshot.root.cornerRadius).toBe(6);
    expect(snapshot.root.layoutMode).toBe('VERTICAL');
    expect(snapshot.root.children).toHaveLength(2);
    expect(snapshot.context.pageName).toBe('Page 1');
    expect(snapshot.context.selectionIds).toEqual(['1:100']);
  });

  it('renders a preview and leaves no node behind', async () => {
    const harness = createHarness([cardSpec()]);
    const before = harness.nodeCount();

    const preview = (await harness.execute(
      command('parallel_preview', {
        nodeId: '1:100',
        scale: 2,
        changes: [{ kind: 'fill', targetId: '1:100', to: { r: 0.99, g: 0.94, b: 0.83, a: 1 } }],
      }),
    )) as { base64: string; width: number; height: number; sourceNodeId: string };

    expect(preview.sourceNodeId).toBe('1:100');
    expect(preview.base64).toBe(Buffer.from([137, 80, 78, 71]).toString('base64'));
    expect(preview.width).toBe(640);
    expect(preview.height).toBe(360);
    // The transient duplicate must be gone again.
    expect(harness.nodeCount()).toBe(before);
  });

  it('applies changes to a duplicate and never touches the original', async () => {
    const harness = createHarness([cardSpec()]);
    const original = harness.getNodeById('1:100')!;
    const originalTitle = harness.getNodeById('1:101')!;
    const before = harness.nodeCount();

    const result = (await harness.execute(
      command('parallel_apply', {
        nodeId: '1:100',
        mode: 'refine',
        variationId: 'refine:1:100',
        changes: [
          { kind: 'itemSpacing', targetId: '1:100', to: 16 },
          { kind: 'cornerRadius', targetId: '1:100', to: 8 },
          { kind: 'letterSpacing', targetId: '1:101', to: 0.4 },
        ],
      }),
    )) as { createdNodeId: string; createdNodeName: string; appliedKinds: string[]; warnings: string[] };

    expect(result.createdNodeId).not.toBe('1:100');
    expect(result.createdNodeName).toBe('Revenue Card · refine');
    expect(result.appliedKinds).toEqual(expect.arrayContaining(['itemSpacing', 'cornerRadius', 'letterSpacing']));
    expect(result.warnings).toEqual([]);

    // Original is byte-for-byte unchanged.
    expect(original.itemSpacing).toBe(14);
    expect(original.cornerRadius).toBe(6);
    expect(originalTitle.letterSpacing).toEqual({ unit: 'PIXELS', value: 0 });

    // The duplicate received the changes, including the child-targeted one.
    const clone = harness.getNodeById(result.createdNodeId)!;
    expect(clone.itemSpacing).toBe(16);
    expect(clone.cornerRadius).toBe(8);
    expect(clone.parent?.id).toBe(harness.page.id);
    const clonedTitle = clone.children!.find((child) => child.type === 'TEXT')!;
    expect(clonedTitle.letterSpacing).toEqual({ unit: 'PIXELS', value: 0.4 });

    // Exactly one extra node subtree was created.
    expect(harness.nodeCount()).toBe(before + 3);
  });

  it('remaps child ids so edits land on the clone, not the source', async () => {
    const harness = createHarness([cardSpec()]);
    const result = (await harness.execute(
      command('parallel_apply', { nodeId: '1:100', changes: [{ kind: 'fill', targetId: '1:102', to: { r: 0, g: 0, b: 0, a: 1 } }] }),
    )) as { createdNodeId: string };

    const clone = harness.getNodeById(result.createdNodeId)!;
    const clonePanel = clone.children!.find((child) => child.name === 'Panel')!;
    const sourcePanel = harness.getNodeById('1:102')!;

    expect(clonePanel.fills?.[0].color).toEqual({ r: 0, g: 0, b: 0 });
    expect(sourcePanel.fills?.[0].color).toEqual({ r: 0.11, g: 0.12, b: 0.16 });
  });

  it('reports partial failures as warnings while applying the rest', async () => {
    const harness = createHarness([
      { id: '5:1', name: 'Box', type: 'FRAME', width: 200, height: 80, fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }] },
    ]);

    const result = (await harness.execute(
      command('parallel_apply', {
        nodeId: '5:1',
        changes: [
          { kind: 'fill', targetId: '5:1', to: { r: 0.2, g: 0.2, b: 0.2, a: 1 } },
          { kind: 'cornerRadius', targetId: '5:1', to: 12 },
          { kind: 'itemSpacing', targetId: '5:1', to: 8 },
        ],
      }),
    )) as { createdNodeId: string; appliedKinds: string[]; warnings: string[] };

    expect(result.appliedKinds).toContain('fill');
    expect(result.warnings.some((w) => /radius/i.test(w))).toBe(true);
    expect(result.warnings.some((w) => /spacing/i.test(w))).toBe(true);
  });

  it('refuses to duplicate a node with no parent instead of failing midway', async () => {
    const harness = createHarness([{ id: '7:1', name: 'Orphan', type: 'FRAME' }]);
    await expect(harness.execute(command('parallel_apply', { nodeId: '7:1', changes: [] }))).resolves.toBeDefined();

    // A missing node is a clear, early error.
    await expect(harness.execute(command('parallel_apply', { nodeId: '9:99', changes: [] }))).rejects.toThrow(/not found/i);
  });

  it('discards an applied duplicate and reports a missing node clearly', async () => {
    const harness = createHarness([cardSpec()]);
    const result = (await harness.execute(command('parallel_apply', { nodeId: '1:100', changes: [{ kind: 'cornerRadius', targetId: '1:100', to: 2 }] }))) as { createdNodeId: string };

    const discarded = (await harness.execute(command('parallel_discard', { nodeId: result.createdNodeId }))) as { removedNodeId: string };
    expect(discarded.removedNodeId).toBe(result.createdNodeId);
    expect(harness.getNodeById(result.createdNodeId)).toBeNull();

    await expect(harness.execute(command('parallel_discard', { nodeId: result.createdNodeId }))).rejects.toThrow(/not found/i);
  });

  it('never writes to a node outside the duplicated component', async () => {
    // An id that is not part of the source subtree must be refused outright.
    const harness = createHarness([
      cardSpec(),
      { id: '2:1', name: 'Unrelated', type: 'FRAME', width: 40, height: 40, fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3 } }] },
    ]);
    const unrelated = harness.getNodeById('2:1')!;

    const result = (await harness.execute(
      command('parallel_apply', {
        nodeId: '1:100',
        changes: [
          { kind: 'fill', targetId: '1:100', to: { r: 0, g: 0, b: 0, a: 1 } },
          { kind: 'fill', targetId: '2:1', to: { r: 1, g: 0, b: 0, a: 1 } },
        ],
      }),
    )) as { createdNodeId: string; appliedKinds: string[]; warnings: string[] };

    expect(unrelated.fills?.[0].color).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
    expect(result.appliedKinds).toEqual(['fill']);
    expect(result.warnings.some((w) => /not part of the duplicated component/i.test(w))).toBe(true);
    expect(harness.getNodeById(result.createdNodeId)!.fills?.[0].color).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('previews and applies a top-level component whose parent is the page', async () => {
    // Regression: setting layoutPositioning = ABSOLUTE throws when the parent is
    // the page, which broke every preview for page-level components.
    const harness = createHarness([cardSpec()]);

    await expect(
      harness.execute(command('parallel_preview', { nodeId: '1:100', scale: 2, changes: [{ kind: 'cornerRadius', targetId: '1:100', to: 2 }] })),
    ).resolves.toBeDefined();

    const result = (await harness.execute(command('parallel_apply', { nodeId: '1:100', mode: 'refine', changes: [{ kind: 'cornerRadius', targetId: '1:100', to: 2 }] }))) as { createdNodeId: string };
    expect(harness.getNodeById(result.createdNodeId)!.cornerRadius).toBe(2);
    expect(harness.getNodeById('1:100')!.cornerRadius).toBe(6);
  });

  it('leaves no duplicate behind when positioning the clone fails', async () => {
    // Regression: a throw after the clone is inserted used to leak the node into
    // the document, because the preview cleanup only ran on a successful return.
    const row: NodeSpec = {
      id: '9:1',
      name: 'Row',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      itemSpacing: 16,
      children: [cardSpec()],
    };
    const harness = createHarness([row], { throwOnLayoutPositioning: true });
    const before = harness.nodeCount();

    await expect(
      harness.execute(command('parallel_preview', { nodeId: '1:100', scale: 2, changes: [] })),
    ).rejects.toThrow(/layoutPositioning/);

    expect(harness.nodeCount()).toBe(before);
    expect(harness.getNodeById('9:1')!.children).toHaveLength(1);
  });

  it('fails closed when exporting an explicit node id that does not resolve', async () => {
    // Regression: a missing nodeId used to silently fall back to exporting the
    // whole current page, masking a deleted/broken node.
    const harness = createHarness([cardSpec()]);

    await expect(harness.execute(command('export_node', { nodeId: '9:99', format: 'PNG', scale: 1 }))).rejects.toThrow(/not found/i);

    const ok = (await harness.execute(command('export_node', { nodeId: '1:100', format: 'PNG', scale: 1 }))) as { id: string; base64: string };
    expect(ok.id).toBe('1:100');
    expect(typeof ok.base64).toBe('string');
  });

  it('rejects unknown command types', async () => {
    const harness = createHarness([cardSpec()]);
    await expect(harness.execute(command('parallel_teleport', {}))).rejects.toThrow(/Unknown command type/i);
  });
});
