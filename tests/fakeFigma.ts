/**
 * A minimal in-memory stand-in for the Figma Plugin API.
 *
 * PARALLEL's riskiest code is the plugin's node work: cloning, remapping ids,
 * applying property changes, exporting and removing. This harness runs the
 * real `plugin/code.js` against a fake document so that behaviour — including
 * "the original is never modified" and partial-failure handling — is verified
 * in CI without a Figma document attached.
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
  layoutPositioning?: string;
  locked?: boolean;
  characters?: string;
  fontSize?: number;
  fontName?: { family: string; style: string };
  lineHeight?: { unit: string; value: number };
  letterSpacing?: { unit: string; value: number };
  textAlignHorizontal?: string;
  remove(): void;
  clone(): FakeNode;
  insertChild(index: number, child: FakeNode): void;
  appendChild(child: FakeNode): void;
  exportAsync(): Promise<Uint8Array>;
};

export type NodeSpec = Partial<Omit<FakeNode, 'parent' | 'remove' | 'clone' | 'insertChild' | 'appendChild' | 'exportAsync'>> & {
  type: string;
  name: string;
  children?: NodeSpec[];
};

let counter = 0;

const walk = (node: FakeNode): FakeNode[] => [node, ...(node.children ?? []).flatMap(walk)];

/** Snapshots live node state into a spec, optionally assigning fresh ids. */
function toSpec(node: FakeNode, freshIds: boolean): NodeSpec {
  const { id, name, type, parent, children, remove, clone, insertChild, appendChild, exportAsync, ...props } = node;
  void parent; void remove; void clone; void insertChild; void appendChild; void exportAsync;
  const spec: NodeSpec = { ...props, name, type, id: freshIds ? `clone:${++counter}` : id };
  if (children) spec.children = children.map((child) => toSpec(child, freshIds));
  return spec;
}

export const makeNode = (spec: NodeSpec, options: { throwOnLayoutPositioning?: boolean } = {}): FakeNode => {
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
    node.children = spec.children.map((child) => makeNode(child, options));
    for (const child of node.children) child.parent = node;
  }

  node.remove = () => {
    const parent = node.parent;
    if (parent?.children) {
      const index = parent.children.indexOf(node);
      if (index >= 0) parent.children.splice(index, 1);
    }
    node.parent = null;
  };

  node.clone = () => {
    // Real Figma clones assign fresh ids to the whole subtree and detach the copy.
    const copy = makeNode(toSpec(node, true), options);
    copy.parent = null;
    return copy;
  };

  node.insertChild = (index, child) => {
    if (!node.children) node.children = [];
    node.children.splice(index, 0, child);
    child.parent = node;
  };

  node.appendChild = (child) => {
    if (!node.children) node.children = [];
    node.children.push(child);
    child.parent = node;
  };

  node.exportAsync = async () => new Uint8Array([137, 80, 78, 71]);

  // Faithful to Figma: layoutPositioning = ABSOLUTE requires an auto-layout parent.
  let layoutPositioning = (spec as FakeNode).layoutPositioning;
  Object.defineProperty(node, 'layoutPositioning', {
    enumerable: true,
    configurable: true,
    get: () => layoutPositioning,
    set: (value: string) => {
      const parent = node.parent;
      const parentIsAutoLayout = Boolean(parent && 'layoutMode' in parent && parent.layoutMode !== 'NONE');
      if (value === 'ABSOLUTE' && options.throwOnLayoutPositioning && parentIsAutoLayout) {
        throw new Error('in set_layoutPositioning: simulated Figma failure');
      }
      if (value === 'ABSOLUTE' && !parentIsAutoLayout) {
        throw new Error('in set_layoutPositioning: Can only set layoutPositioning = ABSOLUTE if the parent node has layoutMode !== NONE');
      }
      layoutPositioning = value;
    },
  });

  return node;
};

export type Harness = {
  page: FakeNode;
  selection: FakeNode[];
  execute: (command: unknown) => Promise<unknown>;
  getNodeById: (id: string) => FakeNode | null;
  exportCount: () => number;
  nodeCount: () => number;
};

/** Builds a fake document and loads the real plugin code against it. */
export const createHarness = (pageChildren: NodeSpec[], options: { throwOnLayoutPositioning?: boolean } = {}): Harness => {
  counter = 0;
  let exports = 0;

  const runtime: Record<string, unknown> = {};
  const page = makeNode({ id: '0:1', name: 'Page 1', type: 'PAGE', children: pageChildren }, options);
  const selection: FakeNode[] = (page.children ?? []).slice(0, 1);

  const nodeById = (id: string): FakeNode | null => walk(page).find((node) => node.id === id) ?? null;

  const track = (node: FakeNode) => {
    const original = node.exportAsync.bind(node);
    node.exportAsync = async () => {
      exports++;
      return original();
    };
    for (const child of node.children ?? []) track(child);
  };

  Object.assign(runtime, {
    root: { id: '0:0', name: 'Test File' },
    mixed: Symbol('figma.mixed'),
    viewport: { scrollAndZoomIntoView: () => {} },
    showUI: () => {},
    loadFontAsync: async () => {},
    clientStorage: { getAsync: async () => undefined, setAsync: async () => {} },
    base64Encode: (bytes: Uint8Array) => Buffer.from(bytes).toString('base64'),
    getNodeById: nodeById,
    currentPage: Object.assign(page, { selection }),
    ui: { onmessage: null, postMessage: () => {} },
  });

  const code = require('node:fs').readFileSync(new URL('../plugin/code.js', import.meta.url), 'utf8');
  const factory = new Function('figma', '__html__', `${code}\n;return { execute };`);
  const plugin = factory(runtime, '') as { execute: (command: unknown) => Promise<unknown> };

  for (const node of walk(page)) track(node);

  return {
    page,
    selection,
    execute: (command) => plugin.execute(command),
    getNodeById: nodeById,
    exportCount: () => exports,
    nodeCount: () => walk(page).length,
  };
};
