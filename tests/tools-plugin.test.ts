import { describe, expect, it } from 'vitest';
import { createHarness, type HarnessOptions, type NodeSpec } from './fakeFigma.js';

const command = (type: string, payload: Record<string, unknown> = {}) => ({ id: `cmd-${type}`, type, payload });

const card = (extra: Partial<NodeSpec> = {}): NodeSpec => ({
  id: '1:100',
  name: 'Card',
  type: 'FRAME',
  width: 320,
  height: 180,
  fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
  strokes: [],
  children: [
    {
      id: '1:101',
      name: 'Title',
      type: 'TEXT',
      width: 120,
      height: 18,
      characters: 'Quarterly revenue',
      fontSize: 13,
      fontName: { family: 'Inter', style: 'Regular' },
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 }, opacity: 1 }],
    },
  ],
  ...extra,
});

const bindingOptions = (): HarnessOptions => ({
  variables: [
    {
      id: 'VariableID:1',
      key: 'brand-key',
      name: 'color/brand',
      description: 'Brand color',
      resolvedType: 'COLOR',
      variableCollectionId: 'VariableCollectionId:1',
      valuesByMode: { '1:0': { r: 1, g: 0, b: 0, a: 1 } },
      scopes: ['ALL_SCOPES'],
      remote: false,
    },
    {
      id: 'VariableID:2',
      key: 'space-key',
      name: 'spacing/md',
      resolvedType: 'FLOAT',
      variableCollectionId: 'VariableCollectionId:1',
      valuesByMode: { '1:0': 16 },
      remote: false,
    },
  ],
  variableCollections: [
    {
      id: 'VariableCollectionId:1',
      name: 'Theme',
      key: 'theme-key',
      modes: [{ modeId: '1:0', name: 'Light' }],
      defaultModeId: '1:0',
      variableIds: ['VariableID:1', 'VariableID:2'],
    },
  ],
  styles: [
    {
      id: 'S:1',
      key: 'style-key',
      name: 'Brand fill',
      type: 'PAINT',
      description: 'Primary surface',
    },
    {
      id: 'S:2',
      key: 'text-key',
      name: 'Body text',
      type: 'TEXT',
    },
  ],
});

describe('plugin get_variable_defs', () => {
  it('resolves bound variables and styles used by the target subtree', async () => {
    const harness = createHarness(
      [
        card({
          boundVariables: {
            fills: [{ type: 'VARIABLE_ALIAS', id: 'VariableID:1' }],
            itemSpacing: { type: 'VARIABLE_ALIAS', id: 'VariableID:2' },
          },
          fillStyleId: 'S:1',
        }),
      ],
      bindingOptions(),
    );

    const result = (await harness.execute(command('get_variable_defs'))) as {
      mode: string;
      file: string;
      node: { id: string };
      variables: Record<string, unknown>;
      definitions: Array<{ name: string; resolvedType: string; collection: { name: string }; usedBy: Array<{ field: string }> }>;
      styles: Record<string, { id: string; type: string }>;
      styleDefinitions: Array<{ name: string; usedBy: Array<{ field: string }> }>;
      nodeCount: number;
      truncated: boolean;
    };

    expect(result.mode).toBe('plugin-api');
    expect(result.file).toBe('Test File');
    expect(result.node.id).toBe('1:100');
    expect(result.variables).toMatchObject({ 'color/brand': '#FF0000', 'spacing/md': 16 });
    expect(result.definitions.find((entry) => entry.name === 'color/brand')).toMatchObject({
      resolvedType: 'COLOR',
      collection: { name: 'Theme' },
      usedBy: [{ field: 'fills' }],
    });
    expect(result.styles['Brand fill']).toMatchObject({ id: 'S:1', type: 'PAINT' });
    expect(result.styleDefinitions[0].usedBy).toEqual([{ nodeId: '1:100', nodeName: 'Card', field: 'fillStyleId' }]);
    expect(result.nodeCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('honours maxDepth and maxNodes', async () => {
    const harness = createHarness([card()], bindingOptions());
    const result = (await harness.execute(command('get_variable_defs', { maxDepth: 0 }))) as {
      nodeCount: number;
      truncated: boolean;
    };
    expect(result.nodeCount).toBe(1);
  });

  it('fails with NODE_NOT_FOUND for an unknown id', async () => {
    const harness = createHarness([card()], bindingOptions());
    await expect(harness.execute(command('get_variable_defs', { nodeId: '9:9' }))).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
  });
});

describe('plugin get_design_context', () => {
  it('returns structured layout, tokens, summary and a screenshot', async () => {
    const harness = createHarness(
      [card({ fillStyleId: 'S:1', boundVariables: { width: { type: 'VARIABLE_ALIAS', id: 'VariableID:2' } } })],
      bindingOptions(),
    );

    const result = (await harness.execute(command('get_design_context', { maxDepth: 2 }))) as {
      mode: string;
      disclaimer: string;
      root: { id: string; fills: Array<{ color: string }>; children: Array<{ text: { characters: string } }> };
      summary: {
        colors: Record<string, number>;
        typography: Record<string, number>;
        components: Record<string, number>;
        nodeCount: number;
      };
      variables: Record<string, unknown>;
      screenshot: { base64: string; mimeType: string; byteLength: number };
      truncated: boolean;
    };

    expect(result.mode).toBe('local-structured');
    expect(result.disclaimer).toMatch(/not Figma's proprietary/i);
    expect(result.root.id).toBe('1:100');
    expect(result.root.fills[0].color).toBe('#FFFFFF');
    expect(result.root.children[0].text.characters).toBe('Quarterly revenue');
    expect(result.summary.colors['#FFFFFF']).toBe(1);
    expect(result.summary.typography['Inter Regular @ 13px']).toBe(1);
    expect(result.summary.nodeCount).toBe(2);
    expect(result.variables).toMatchObject({ 'spacing/md': 16 });
    expect(result.screenshot).toMatchObject({ mimeType: 'image/png', byteLength: 4 });
    expect(result.screenshot.base64).toBe(Buffer.from([137, 80, 78, 71]).toString('base64'));
    expect(result.truncated).toBe(false);
  });

  it('can omit the screenshot and warn about compatibility flags', async () => {
    const harness = createHarness([card()], bindingOptions());
    const result = (await harness.execute(
      command('get_design_context', {
        excludeScreenshot: true,
        forceCode: true,
        disableCodeConnect: true,
        clientLanguages: 'typescript',
      }),
    )) as { screenshot?: unknown; warnings: string[] };

    expect(result.screenshot).toBeUndefined();
    expect(result.warnings.join('\n')).toMatch(/forceCode is ignored/i);
    expect(result.warnings.join('\n')).toMatch(/Code Connect is unavailable/i);
    expect(result.warnings.join('\n')).toMatch(/clientLanguages\/clientFrameworks are informational/i);
  });

  it('omits variables when includeVariables is false', async () => {
    const harness = createHarness(
      [card({ boundVariables: { width: { type: 'VARIABLE_ALIAS', id: 'VariableID:2' } } })],
      bindingOptions(),
    );
    const result = (await harness.execute(
      command('get_design_context', { includeVariables: false, excludeScreenshot: true }),
    )) as { root: { variables?: unknown }; variables?: unknown };
    expect(result.root.variables).toBeUndefined();
    expect(result.variables).toBeUndefined();
  });

  it('respects maxNodes truncation', async () => {
    const harness = createHarness([card()], bindingOptions());
    const result = (await harness.execute(command('get_design_context', { maxNodes: 1 }))) as {
      truncated: boolean;
      summary: { nodeCount: number };
      warnings: string[];
    };
    expect(result.truncated).toBe(true);
    expect(result.warnings.join('\n')).toMatch(/truncated/i);
  });
});

describe('plugin get_metadata XML', () => {
  it('emits an XML outline with escaped text and a truncation marker', async () => {
    const harness = createHarness([
      card({
        name: 'Card & <Hero>',
        children: [{ id: '1:160', name: 'Title', type: 'TEXT', characters: 'A < B & C' }],
      }),
    ]);

    const xml = (await harness.execute(command('get_node_tree', { nodeId: '1:100', format: 'xml' }))) as string;
    expect(xml).toContain('<frame');
    expect(xml).toContain('name="Card &amp; &lt;Hero&gt;"');
    expect(xml).toContain('<text>A &lt; B &amp; C</text>');

    const truncated = (await harness.execute(
      command('get_node_tree', { nodeId: '1:100', format: 'xml', maxNodes: 1 }),
    )) as string;
    expect(truncated).toContain('<!-- truncated at 1 nodes -->');
  });
});

describe('plugin FigJam commands', () => {
  const board = (): NodeSpec[] => [
    {
      id: '2:1',
      name: 'Flow',
      type: 'FRAME',
      children: [
        { id: '2:2', name: 'Start', type: 'SHAPE_WITH_TEXT', shapeType: 'ROUNDED_RECTANGLE', characters: 'Start' },
        { id: '2:3', name: 'Note', type: 'STICKY', authorName: 'Ada', characters: 'Remember this' },
        {
          id: '2:4',
          name: 'Arrow',
          type: 'CONNECTOR',
          connectorStart: { endpointNodeId: '2:2', magnet: 'AUTO' },
          connectorEnd: { endpointNodeId: '2:3', magnet: 'TOP' },
        },
      ],
    },
  ];

  it('rejects get_figjam outside a FigJam file', async () => {
    const harness = createHarness(board());
    await expect(harness.execute(command('get_figjam'))).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
  });

  it('returns a FigJam XML outline without images when requested', async () => {
    const harness = createHarness(board(), { editorType: 'figjam' });
    const result = (await harness.execute(
      command('get_figjam', { includeImagesOfNodes: false }),
    )) as { xml: string; images: unknown[]; editorType: string; nodeCount: number; truncated: boolean };

    expect(result.editorType).toBe('figjam');
    expect(result.xml).toContain('<figjam');
    expect(result.xml).toContain('<shape_with_text');
    expect(result.xml).toContain('shapeType="ROUNDED_RECTANGLE"');
    expect(result.xml).toContain('<sticky');
    expect(result.xml).toContain('authorName="Ada"');
    expect(result.xml).toContain('startNodeId="2:2"');
    expect(result.xml).toContain('endMagnet="TOP"');
    expect(result.xml).toContain('<text>Remember this</text>');
    expect(result.images).toEqual([]);
    expect(result.nodeCount).toBe(4);
    expect(result.truncated).toBe(false);
  });

  it('generates a diagram from the supported Mermaid subset', async () => {
    const harness = createHarness([], { editorType: 'figjam' });
    const before = harness.nodeCount();
    const result = (await harness.execute(
      command('generate_diagram', {
        name: 'Release flow',
        mermaidSyntax: 'flowchart LR\nA[Start] --> B{Ready?}\nB -->|Yes| C((Done))',
      }),
    )) as {
      name: string;
      direction: string;
      nodes: Array<{ id: string; sourceId: string; label: string; shape: string }>;
      edges: Array<{ from: string; to: string; label?: string }>;
      warnings: string[];
    };

    expect(result.name).toBe('Release flow');
    expect(result.direction).toBe('LR');
    expect(result.nodes.map((node) => node.sourceId)).toEqual(['A', 'B', 'C']);
    expect(result.nodes.map((node) => node.shape)).toEqual(['SQUARE', 'DIAMOND', 'ELLIPSE']);
    expect(result.edges).toHaveLength(2);
    expect(result.edges[1]).toMatchObject({ label: 'Yes' });
    expect(result.warnings).toEqual([]);
    expect(harness.nodeCount()).toBe(before + 5);
  });

  it('rejects unsupported Mermaid diagram types and non-FigJam files', async () => {
    const figjam = createHarness([], { editorType: 'figjam' });
    await expect(
      figjam.execute(command('generate_diagram', { name: 'Seq', mermaidSyntax: 'sequenceDiagram\nA->>B: Hi' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_DIAGRAM_TYPE' });

    const design = createHarness([]);
    await expect(
      design.execute(command('generate_diagram', { name: 'Flow', mermaidSyntax: 'graph LR\nA --> B' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' });
  });
});

describe('plugin get_motion_context', () => {
  const animated = (): NodeSpec => ({
    id: '3:1',
    name: 'Hero',
    type: 'FRAME',
    animations: {
      OPACITY: {
        baseValue: { type: 'FLOAT', value: 0 },
        timelineDuration: 1,
        tracks: [
          {
            keyframes: [
              { timelinePosition: 0.5, value: { type: 'FLOAT', value: 0.5 }, easing: { type: 'EASE_IN_AND_OUT' } },
              { timelinePosition: 1, value: { type: 'FLOAT', value: 1 }, easing: { type: 'EASE_OUT' } },
            ],
          },
        ],
      },
      TRANSLATION_X: {
        baseValue: { type: 'FLOAT', value: -24 },
        timelineDuration: 1,
        tracks: [{ keyframes: [{ timelinePosition: 1, value: { type: 'FLOAT', value: 0 } }] }],
      },
      UNKNOWN_FIELD: {
        baseValue: { type: 'FLOAT', value: 0 },
        tracks: [{ keyframes: [{ timelinePosition: 1, value: { type: 'FLOAT', value: 1 } }] }],
      },
    },
    animationStyles: [{ name: 'Fade in' }],
    timelines: [{ name: 'Main' }],
  });

  it('serializes keyframes and generates CSS/Motion snippets', async () => {
    const harness = createHarness([animated()]);
    const result = (await harness.execute(command('get_motion_context'))) as {
      mode: string;
      node: { id: string };
      nodes: Array<{
        hasAnimation: boolean;
        animationStyles: Array<{ name: string }>;
        timelines: Array<{ name: string }>;
        snippets: { css: string[]; motion: string[] };
        warnings: string[];
      }>;
      warnings: string[];
      limitations: string[];
    };

    expect(result.mode).toBe('plugin-api-partial');
    expect(result.nodes).toHaveLength(1);
    const [node] = result.nodes;
    expect(node.hasAnimation).toBe(true);
    expect(node.animationStyles).toEqual([{ name: 'Fade in' }]);
    expect(node.timelines).toEqual([{ name: 'Main' }]);
    expect(node.snippets.css.join('\n')).toContain('@keyframes figma-3-1-opacity');
    expect(node.snippets.css.join('\n')).toContain('opacity: 0.5;');
    expect(node.snippets.css.join('\n')).toContain('transform: translateX(-24px);');
    expect(node.snippets.motion.join('\n')).toContain('animate(element');
    expect(node.warnings.join('\n')).toMatch(/UNKNOWN_FIELD/);
    expect(result.warnings.join('\n')).toMatch(/figma\.motion is not available/);
  });

  it('walks descendants only when recursive is true', async () => {
    const harness = createHarness([
      {
        id: '3:10',
        name: 'Parent',
        type: 'FRAME',
        children: [{ ...animated(), id: '3:11', name: 'Child' }],
      },
    ]);

    const shallow = (await harness.execute(command('get_motion_context'))) as { nodes: Array<{ id: string }> };
    expect(shallow.nodes.map((node) => node.id)).toEqual(['3:10']);

    const deep = (await harness.execute(
      command('get_motion_context', { recursive: true }),
    )) as { nodes: Array<{ id: string }> };
    expect(deep.nodes.map((node) => node.id)).toEqual(['3:10', '3:11']);
  });
});

describe('plugin shader commands', () => {
  const shaders = [
    {
      id: 'shader:1',
      name: 'Noise',
      type: 'effect',
      imported: true,
      propertyDefinitions: { scale: { name: 'Scale', type: 'FLOAT', defaultValue: 4 } },
    },
  ];

  it('lists available shaders and their property definitions', async () => {
    const harness = createHarness([card()], { shaders });
    const result = (await harness.execute(command('list_shaders'))) as {
      mode: string;
      shaders: Array<{ id: string; name: string; type: string; imported: boolean }>;
      truncated: boolean;
    };
    expect(result.mode).toBe('plugin-api-available-shaders');
    expect(result.shaders).toEqual([
      {
        id: 'shader:1',
        name: 'Noise',
        type: 'effect',
        imported: true,
        propertyDefinitions: { scale: { name: 'Scale', type: 'FLOAT', defaultValue: 4 } },
      },
    ]);
    expect(result.truncated).toBe(false);
  });

  it('returns metadata for one shader and fails clearly when missing', async () => {
    const harness = createHarness([card()], { shaders });
    const found = (await harness.execute(command('get_shader', { id: 'shader:1' }))) as {
      sourceAvailable: boolean;
      name: string;
    };
    expect(found.name).toBe('Noise');
    expect(found.sourceAvailable).toBe(false);
    await expect(harness.execute(command('get_shader', { id: 'shader:nope' }))).rejects.toMatchObject({
      code: 'SHADER_NOT_FOUND',
    });
  });

  it('lists shader usage in the file', async () => {
    const harness = createHarness(
      [
        card({
          fills: [
            {
              type: 'SHADER',
              id: 'shader:1',
              properties: { scale: 2 },
              propertyMetadata: { scale: { name: 'Scale', type: 'FLOAT' } },
            },
          ],
        }),
      ],
      { shaders },
    );

    const result = (await harness.execute(command('list_file_shaders'))) as {
      scope: string;
      shaders: Array<{ id: string; name: string; usedBy: Array<{ nodeId: string; collection: string }> }>;
      nodeCount: number;
    };
    expect(result.scope).toBe('current-page');
    expect(result.shaders[0].name).toBe('Noise');
    expect(result.shaders[0].usedBy[0]).toMatchObject({ nodeId: '1:100', collection: 'fills' });
    expect(result.nodeCount).toBe(3);
  });

  it('reports LIBRARY_UNAVAILABLE when the build cannot list shaders', async () => {
    const harness = createHarness([card()], { figma: { listAvailableShaders: undefined } });
    await expect(harness.execute(command('list_shaders'))).rejects.toMatchObject({
      code: 'LIBRARY_UNAVAILABLE',
    });
  });
});

describe('plugin library and design-system search', () => {
  const options = (): HarnessOptions => ({
    ...bindingOptions(),
    libraryCollections: [
      {
        key: 'lib:col:1',
        name: 'Brand',
        libraryName: 'Acme UI',
      },
    ],
    libraryVariables: {
      'lib:col:1': [
        { key: 'lib:var:1', name: 'color/brand', resolvedType: 'COLOR' },
        { key: 'lib:var:2', name: 'radius/md', resolvedType: 'FLOAT' },
      ],
    },
  });

  it('lists enabled library collections, local collections and local assets', async () => {
    const harness = createHarness(
      [
        { id: '4:1', name: 'Button', type: 'COMPONENT' },
        { id: '4:2', name: 'Button Group', type: 'COMPONENT_SET' },
      ],
      options(),
    );

    const result = (await harness.execute(
      command('get_libraries', { includeVariables: true }),
    )) as {
      mode: string;
      variableLibraries: Array<{ libraryName: string; collections: Array<{ name: string; variables: unknown[] }> }>;
      localVariableCollections: Array<{ name: string; variableCount: number }>;
      localAssets: { paintStyles: number; textStyles: number; components: number; componentSets: number };
      localStyleNames: { paint: string[]; text: string[] };
      warnings: string[];
    };

    expect(result.mode).toBe('plugin-api-partial');
    expect(result.variableLibraries[0].libraryName).toBe('Acme UI');
    expect(result.variableLibraries[0].collections[0].variables).toHaveLength(2);
    expect(result.localVariableCollections[0]).toMatchObject({ name: 'Theme', variableCount: 2 });
    expect(result.localAssets).toMatchObject({ paintStyles: 1, textStyles: 1, components: 1, componentSets: 1 });
    expect(result.localStyleNames).toMatchObject({ paint: ['Brand fill'], text: ['Body text'] });
    expect(result.warnings).toEqual([]);
  });

  it('searches components, variables and styles with ranked matches', async () => {
    const harness = createHarness(
      [
        { id: '4:10', name: 'Button', type: 'COMPONENT', key: 'component-key' },
        { id: '4:11', name: 'Card', type: 'COMPONENT' },
      ],
      options(),
    );

    const result = (await harness.execute(
      command('search_design_system', {
        queries: [
          { entity: 'component', query: 'Button' },
          { entity: 'variable', query: 'brand' },
          { entity: 'style', query: 'Brand' },
        ],
        limit: 5,
      }),
    )) as {
      scope: string;
      results: Array<{ entity: string; query: string; truncated: boolean; results: Array<{ name: string }> }>;
      candidateCount: number;
    };

    expect(result.scope).toBe('local-assets-and-enabled-library-variables');
    expect(result.results[0].results.map((entry) => entry.name)).toEqual(['Button']);
    expect(result.results[1].results.map((entry) => entry.name)).toContain('color/brand');
    expect(result.results[2].results.map((entry) => entry.name)).toEqual(['Brand fill']);
    expect(result.candidateCount).toBeGreaterThanOrEqual(5);
  });

  it('requires at least one query', async () => {
    const harness = createHarness([card()], options());
    await expect(harness.execute(command('search_design_system', { queries: [] }))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });
});

describe('plugin asset commands', () => {
  const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  it('collects exports, original images and SVG assets', async () => {
    const harness = createHarness(
      [
        card({
          fills: [{ type: 'IMAGE', imageHash: 'hash:1', scaleMode: 'FILL' }],
          children: [{ id: '5:2', name: 'Icon', type: 'VECTOR', width: 24, height: 24 }],
        }),
      ],
      { images: { 'hash:1': { bytes: PNG_BYTES, width: 2, height: 2 } } },
    );

    const result = (await harness.execute(command('download_assets'))) as {
      mode: string;
      assets: Array<{ nodeId: string; format: string; byteLength: number }>;
      rawImages: Array<{ hash: string; format: string; byteLength: number }>;
      svgAssets: Array<{ nodeId: string; format: string }>;
      truncated: boolean;
    };

    expect(result.mode).toBe('local-files');
    expect(result.assets[0]).toMatchObject({ nodeId: '1:100', format: 'png', byteLength: 4 });
    expect(result.rawImages[0]).toMatchObject({ hash: 'hash:1', format: 'png', byteLength: 8 });
    expect(result.svgAssets[0]).toMatchObject({ nodeId: '5:2', format: 'svg' });
    expect(result.truncated).toBe(false);
  });

  it('rejects an unknown requested node', async () => {
    const harness = createHarness([card()]);
    await expect(harness.execute(command('download_assets', { nodeIds: ['9:9'] }))).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
  });

  it('uploads a raster as a new image-filled frame', async () => {
    const harness = createHarness([]);
    const result = (await harness.execute(
      command('upload_assets', {
        assets: [{ name: 'photo.png', mimeType: 'image/png', base64: Buffer.from(PNG_BYTES).toString('base64') }],
      }),
    )) as { assets: Array<{ nodeId: string; kind: string; imageHash: string }> };

    expect(result.assets[0]).toMatchObject({ kind: 'frame', imageHash: 'image-1' });
    const frame = harness.getNodeById(result.assets[0].nodeId);
    expect(frame?.fills).toEqual([{ type: 'IMAGE', imageHash: 'image-1', scaleMode: 'FILL' }]);
  });

  it('applies a raster to an existing node fill', async () => {
    const harness = createHarness([card()]);
    const result = (await harness.execute(
      command('upload_assets', {
        assets: [{ name: 'photo.png', mimeType: 'image/png', base64: Buffer.from(PNG_BYTES).toString('base64') }],
        nodeIds: ['1:100'],
        scaleMode: 'FIT',
      }),
    )) as { assets: Array<{ kind: string; nodeId: string }> };

    expect(result.assets[0]).toMatchObject({ kind: 'fill', nodeId: '1:100' });
    expect(harness.getNodeById('1:100')?.fills).toHaveLength(2);
    expect(harness.getNodeById('1:100')?.fills?.[1]).toMatchObject({ type: 'IMAGE', imageHash: 'image-1', scaleMode: 'FIT' });
  });

  it('uploads an SVG as an editable vector layer', async () => {
    const harness = createHarness([]);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    const result = (await harness.execute(
      command('upload_assets', {
        assets: [{ name: 'icon.svg', mimeType: 'image/svg+xml', base64: Buffer.from(svg).toString('base64') }],
      }),
    )) as { assets: Array<{ kind: string; name: string }> };

    expect(result.assets[0]).toMatchObject({ kind: 'svg', name: 'icon.svg' });
    expect(harness.getNodeById(result.assets[0].nodeId)?.svg).toBe(svg);
  });

  it('rejects target/fill mismatches and unsupported target nodes', async () => {
    const harness = createHarness([
      card({ children: [{ id: '1:150', name: 'Plain vector', type: 'VECTOR' }] }),
    ]);
    await expect(
      harness.execute(
        command('upload_assets', {
          assets: [
            { name: 'a.png', mimeType: 'image/png', base64: Buffer.from(PNG_BYTES).toString('base64') },
            { name: 'b.png', mimeType: 'image/png', base64: Buffer.from(PNG_BYTES).toString('base64') },
          ],
          nodeIds: ['1:100'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ASSET_TARGETS' });

    await expect(
      harness.execute(
        command('upload_assets', {
          assets: [{ name: 'a.png', mimeType: 'image/png', base64: Buffer.from(PNG_BYTES).toString('base64') }],
          nodeIds: ['1:150'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_NODE' });
  });

  it('rejects an empty asset list', async () => {
    const harness = createHarness([]);
    await expect(harness.execute(command('upload_assets', { assets: [] }))).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });
});

describe('plugin export_video', () => {
  it('exports a top-level frame as MP4 with snapped fps and quality', async () => {
    const harness = createHarness([card()]);
    const result = (await harness.execute(
      command('export_video', {
        nodeId: '1:100',
        fps: 45,
        quality: 'medium',
        constraint: { type: 'SCALE', value: 2 },
      }),
    )) as {
      format: string;
      mimeType: string;
      fps: number;
      quality: string;
      base64: string;
      byteLength: number;
      warnings: string[];
      limitations: string[];
    };

    expect(result).toMatchObject({ format: 'MP4', mimeType: 'video/mp4', fps: 30, quality: 'medium', byteLength: 12 });
    expect(result.base64).toBe(Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]).toString('base64'));
    expect(result.warnings.join('\n')).toMatch(/Requested 45 fps/);
    expect(result.limitations.join('\n')).toMatch(/writes a local file/i);
  });

  it('validates node ids, SCALE values and quality', async () => {
    const harness = createHarness([card()]);
    await expect(harness.execute(command('export_video', {}))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(harness.execute(command('export_video', { nodeId: '9:9' }))).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
    await expect(
      harness.execute(command('export_video', { nodeId: '1:100', constraint: { type: 'SCALE', value: 1.25 } })),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      harness.execute(command('export_video', { nodeId: '1:100', quality: 'ultra' })),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('wraps Figma export failures with EXPORT_FAILED', async () => {
    const harness = createHarness([card()]);
    const node = harness.getNodeById('1:100');
    node!.exportAsync = async () => {
      throw new Error('node is not a top-level animated frame');
    };
    await expect(harness.execute(command('export_video', { nodeId: '1:100' }))).rejects.toMatchObject({
      code: 'EXPORT_FAILED',
    });
  });
});
