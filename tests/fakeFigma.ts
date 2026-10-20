/**
 * A minimal in-memory stand-in for the Figma Plugin API.
 *
 * Runs the real `plugin/code.js` against a fake document so node serialization,
 * exports, command dispatch and UI-message handling can be verified in CI
 * without a Figma document attached.
 */

export type FakePaint = { type: string; color?: { r: number; g: number; b: number }; opacity?: number };

export type FakeNode = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  parent: FakeNode | null;
  children?: FakeNode[];
  fills?: FakePaint[];
  strokes?: FakePaint[];
  strokeWeight?: number | symbol;
  cornerRadius?: number | symbol;
  layoutMode?: string;
  itemSpacing?: number | symbol;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  characters?: string;
  fontSize?: number;
  fontName?: { family: string; style: string };
  lineHeight?: { unit: string; value?: number };
  letterSpacing?: { unit: string; value?: number };
  textAlignHorizontal?: string;
  exportAsync(settings?: Record<string, unknown>): Promise<Uint8Array>;
  appendChild(child: FakeNode): void;
  resize(width: number, height: number): void;
  remove(): void;
  findAll(predicate?: (node: FakeNode) => boolean): FakeNode[];
  findAllWithCriteria(criteria?: { types?: string[] }): FakeNode[];
  [key: string]: unknown;
};

export type NodeSpec = Partial<Omit<FakeNode, 'parent' | 'exportAsync'>> & {
  type: string;
  name: string;
  children?: NodeSpec[];
};

let counter = 0;

const walk = (node: FakeNode): FakeNode[] => [node, ...(node.children ?? []).flatMap(walk)];

export const makeNode = (spec: NodeSpec): FakeNode => {
  const node = {
    id: spec.id ?? `n:${++counter}`,
    name: spec.name,
    type: spec.type,
    x: spec.x ?? 0,
    y: spec.y ?? 0,
    width: spec.width ?? 100,
    height: spec.height ?? 100,
    visible: spec.visible ?? true,
    opacity: spec.opacity ?? 1,
    ...spec,
  } as FakeNode;

  node.parent = null;
  if (spec.children) {
    node.children = spec.children.map((child) => makeNode(child));
    for (const child of node.children) child.parent = node;
  }

  node.exportAsync = async (settings?: Record<string, unknown>) => {
    const format = String(settings?.format ?? 'PNG').toUpperCase();
    if (format === 'MP4' || format === 'WEBM' || format === 'GIF') {
      return new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    }
    if (format === 'SVG' || format === 'SVG_STRING') {
      return new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" />');
    }
    return new Uint8Array([137, 80, 78, 71]);
  };
  node.appendChild = (child: FakeNode) => {
    if (!node.children) node.children = [];
    node.children.push(child);
    child.parent = node;
  };
  node.resize = (width: number, height: number) => {
    node.width = width;
    node.height = height;
  };
  node.remove = () => {
    const siblings = node.parent?.children;
    if (siblings) {
      const index = siblings.indexOf(node);
      if (index >= 0) siblings.splice(index, 1);
    }
    node.parent = null;
  };
  node.findAll = (predicate?: (node: FakeNode) => boolean) =>
    walk(node).slice(1).filter((child) => (predicate ? predicate(child) : true));
  node.findAllWithCriteria = (criteria?: { types?: string[] }) =>
    node.findAll((child) => !criteria?.types || criteria.types.includes(child.type));

  return node;
};

export type HarnessOptions = {
  editorType?: 'figma' | 'figjam' | 'slides';
  variables?: Array<Record<string, unknown>>;
  variableCollections?: Array<Record<string, unknown>>;
  styles?: Array<Record<string, unknown>>;
  shaders?: Array<Record<string, unknown>>;
  libraryCollections?: Array<Record<string, unknown>>;
  libraryVariables?: Record<string, Array<Record<string, unknown>>>;
  images?: Record<string, { bytes?: Uint8Array; width?: number; height?: number }>;
  figma?: Record<string, unknown>;
};

export type Harness = {
  page: FakeNode;
  selection: FakeNode[];
  execute: (command: unknown) => Promise<unknown>;
  onMessage: (message: unknown) => Promise<void>;
  messages: Array<Record<string, unknown>>;
  getNodeById: (id: string) => FakeNode | null;
  exportCount: () => number;
  nodeCount: () => number;
  showUI: { width?: number; height?: number } | null;
  storage: Map<string, unknown>;
};

/** Builds a fake document and loads the real plugin code against it. */
export const createHarness = (pageChildren: NodeSpec[], options: HarnessOptions = {}): Harness => {
  counter = 0;
  let exports = 0;
  const messages: Array<Record<string, unknown>> = [];
  const storage = new Map<string, unknown>();

  const runtime: Record<string, unknown> = {};
  const page = makeNode({ id: '0:1', name: 'Page 1', type: 'PAGE', children: pageChildren });
  const selection: FakeNode[] = (page.children ?? []).slice(0, 1);

  const nodeById = (id: string): FakeNode | null => walk(page).find((node) => node.id === id) ?? null;

  const track = (node: FakeNode) => {
    const original = node.exportAsync.bind(node);
    node.exportAsync = async (settings?: Record<string, unknown>) => {
      exports++;
      return original(settings);
    };
  };

  const findOne = (predicate: (node: FakeNode) => boolean) => walk(page).find(predicate) ?? null;

  let showUIOptions: { width?: number; height?: number } | null = null;

  Object.assign(page, {
    selection,
    findOne,
    findAll: (predicate?: (node: FakeNode) => boolean) =>
      walk(page).slice(1).filter((node) => (predicate ? predicate(node) : true)),
    findAllWithCriteria: (criteria?: { types?: string[] }) =>
      walk(page)
        .slice(1)
        .filter((node) => !criteria?.types || criteria.types.includes(node.type)),
  });

  const variables = new Map((options.variables ?? []).map((variable) => [String(variable.id), variable]));
  const collections = new Map(
    (options.variableCollections ?? []).map((collection) => [String(collection.id), collection]),
  );
  const styles = new Map((options.styles ?? []).map((style) => [String(style.id), style]));
  const shaders = options.shaders ?? [];
  const imageStore = new Map(Object.entries(options.images ?? {}));

  const createNode = (type: string, name: string, width = 100, height = 100): FakeNode =>
    makeNode({ type, name, width, height });

  const createImage = (bytes: Uint8Array) => {
    const hash = `image-${imageStore.size + 1}`;
    imageStore.set(hash, { bytes });
    return {
      hash,
      getBytesAsync: async () => imageStore.get(hash)?.bytes ?? bytes,
      getSizeAsync: async () => ({
        width: imageStore.get(hash)?.width ?? 1,
        height: imageStore.get(hash)?.height ?? 1,
      }),
    };
  };

  const teamLibrary = options.libraryCollections
    ? {
        getAvailableLibraryVariableCollectionsAsync: async () => options.libraryCollections,
        getVariablesInLibraryCollectionAsync: async (key: string) => options.libraryVariables?.[key] ?? [],
      }
    : undefined;

  Object.assign(runtime, {
    root: { id: '0:0', name: 'Test File', children: [page] },
    editorType: options.editorType ?? 'figma',
    mixed: Symbol('figma.mixed'),
    viewport: { scrollAndZoomIntoView: () => {}, center: { x: 0, y: 0 } },
    showUI: (_html: string, uiOptions: { width?: number; height?: number }) => {
      showUIOptions = uiOptions;
    },
    loadFontAsync: async () => {},
    clientStorage: {
      getAsync: async (key: string) => storage.get(key),
      setAsync: async (key: string, value: unknown) => {
        storage.set(key, value);
      },
    },
    base64Encode: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64'),
    base64Decode: (base64: string) => new Uint8Array(Buffer.from(base64, 'base64')),
    getNodeById: nodeById,
    getNodeByIdAsync: async (id: string) => nodeById(id),
    currentPage: page,
    variables: {
      getVariableById: (id: string) => variables.get(id) ?? null,
      getVariableByIdAsync: async (id: string) => variables.get(id) ?? null,
      getVariableCollectionById: (id: string) => collections.get(id) ?? null,
      getVariableCollectionByIdAsync: async (id: string) => collections.get(id) ?? null,
      getLocalVariablesAsync: async () => Array.from(variables.values()),
      getLocalVariableCollectionsAsync: async () => Array.from(collections.values()),
    },
    getStyleById: (id: string) => styles.get(id) ?? null,
    getStyleByIdAsync: async (id: string) => styles.get(id) ?? null,
    getLocalPaintStylesAsync: async () => Array.from(styles.values()).filter((style) => style.type === 'PAINT'),
    getLocalTextStylesAsync: async () => Array.from(styles.values()).filter((style) => style.type === 'TEXT'),
    getLocalEffectStylesAsync: async () => Array.from(styles.values()).filter((style) => style.type === 'EFFECT'),
    getLocalGridStylesAsync: async () => Array.from(styles.values()).filter((style) => style.type === 'GRID'),
    teamLibrary,
    listAvailableShaders: async () => shaders,
    listAvailableShadersAsync: async () => shaders,
    getImageByHash: (hash: string) => {
      const image = imageStore.get(hash);
      if (!image) return null;
      return {
        hash,
        getBytesAsync: async () => image.bytes ?? new Uint8Array(),
        getSizeAsync: async () => ({ width: image.width ?? 1, height: image.height ?? 1 }),
      };
    },
    createImage,
    createRectangle: () => createNode('RECTANGLE', 'Rectangle'),
    createFrame: () => createNode('FRAME', 'Frame'),
    createShapeWithText: () => createNode('SHAPE_WITH_TEXT', 'Shape'),
    createConnector: () => createNode('CONNECTOR', 'Connector'),
    createNodeFromSvg: (svg: string) => {
      const node = createNode('FRAME', 'SVG');
      node.svg = svg;
      return node;
    },
    ...options.figma,
    ui: {
      onmessage: null,
      postMessage: (message: Record<string, unknown>) => messages.push(message),
    },
  });

  const code = require('node:fs').readFileSync(new URL('../plugin/code.js', import.meta.url), 'utf8');
  const factory = new Function('figma', '__html__', `${code}\n;return { execute };`);
  const plugin = factory(runtime, '') as { execute: (command: unknown) => Promise<unknown> };

  for (const node of walk(page)) track(node);

  const originalAppend = page.appendChild.bind(page);
  Object.assign(page, {
    appendChild: (child: FakeNode) => {
      originalAppend(child);
      track(child);
    },
  });
  return {
    page,
    selection,
    execute: (command) => plugin.execute(command),
    onMessage: async (message) => {
      const handler = runtime.ui as { onmessage: ((message: unknown) => Promise<void>) | null };
      await handler.onmessage?.(message);
    },
    messages,
    getNodeById: nodeById,
    exportCount: () => exports,
    nodeCount: () => walk(page).length,
    get showUI() {
      return showUIOptions;
    },
    storage,
  };
};
