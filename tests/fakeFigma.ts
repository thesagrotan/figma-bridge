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
  exportAsync(): Promise<Uint8Array>;
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

  node.exportAsync = async () => new Uint8Array([137, 80, 78, 71]);

  return node;
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
  showUI: (() => { width?: number; height?: number }) | null;
};

/** Builds a fake document and loads the real plugin code against it. */
export const createHarness = (pageChildren: NodeSpec[]): Harness => {
  counter = 0;
  let exports = 0;
  const messages: Array<Record<string, unknown>> = [];

  const runtime: Record<string, unknown> = {};
  const page = makeNode({ id: '0:1', name: 'Page 1', type: 'PAGE', children: pageChildren });
  const selection: FakeNode[] = (page.children ?? []).slice(0, 1);

  const nodeById = (id: string): FakeNode | null => walk(page).find((node) => node.id === id) ?? null;

  const track = (node: FakeNode) => {
    const original = node.exportAsync.bind(node);
    node.exportAsync = async () => {
      exports++;
      return original();
    };
  };

  const findOne = (predicate: (node: FakeNode) => boolean) => walk(page).find(predicate) ?? null;

  let showUI: (() => { width?: number; height?: number }) | null = null;

  Object.assign(page, { selection, findOne });

  Object.assign(runtime, {
    root: { id: '0:0', name: 'Test File' },
    mixed: Symbol('figma.mixed'),
    viewport: { scrollAndZoomIntoView: () => {} },
    showUI: (options: { width?: number; height?: number }) => {
      showUI = () => options;
    },
    loadFontAsync: async () => {},
    clientStorage: { getAsync: async () => undefined, setAsync: async () => {} },
    base64Encode: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64'),
    getNodeById: nodeById,
    currentPage: page,
    ui: {
      onmessage: null,
      postMessage: (message: Record<string, unknown>) => messages.push(message),
    },
  });

  const code = require('node:fs').readFileSync(new URL('../plugin/code.js', import.meta.url), 'utf8');
  const factory = new Function('figma', '__html__', `${code}\n;return { execute };`);
  const plugin = factory(runtime, '') as { execute: (command: unknown) => Promise<unknown> };

  for (const node of walk(page)) track(node);

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
      return showUI;
    },
  };
};
