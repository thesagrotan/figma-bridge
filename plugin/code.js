figma.showUI(__html__, { width: 320, height: 96 });

// Preload and cache common fonts
const loadedFonts = new Set();
async function ensureFontLoaded(font = { family: "Inter", style: "Regular" }) {
  const key = `${font.family}-${font.style}`;
  if (loadedFonts.has(key)) return;
  await figma.loadFontAsync(font);
  loadedFonts.add(key);
}

// Background warmup on launch
Promise.all([
  ensureFontLoaded({ family: "Inter", style: "Regular" }),
  ensureFontLoaded({ family: "Inter", style: "Medium" }),
  ensureFontLoaded({ family: "Inter", style: "Semi Bold" }),
]).catch(() => {});

const sessionId = `sess-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
function sessionInfo() {
  return {
    sessionId,
    fileName: figma.root && figma.root.name ? figma.root.name : null,
    pageName: figma.currentPage ? figma.currentPage.name : null,
    editorType: typeof figma.editorType === "string" ? figma.editorType : "figma",
  };
}

// Commands can time out server-side while queued or running. The server sends a
// cancel message and also stamps every command with an expiry, so a late result
// is never delivered for a command the caller already gave up on.
const cancelledCommands = new Set();
const cancelOrder = [];
function cancelCommand(id) {
  if (!id) return;
  cancelledCommands.add(id);
  cancelOrder.push(id);
  if (cancelOrder.length > 200) {
    const oldest = cancelOrder.shift();
    cancelledCommands.delete(oldest);
  }
}

function isCancelled(command) {
  const id = command && command.id;
  if (!id) return false;
  if (cancelledCommands.has(id)) return true;
  if (command.expiresAt && Date.now() > Number(command.expiresAt)) {
    cancelCommand(id);
    return true;
  }
  return false;
}

function postSession() {
  figma.ui.postMessage({ type: "session", ...sessionInfo() });
}

// Sync persistent settings from clientStorage to UI on launch
(async () => {
  try {
    const savedPort = await figma.clientStorage.getAsync("figma_mcp_unchained_port");
    const savedToken = await figma.clientStorage.getAsync("figma_mcp_unchained_token");
    if (savedPort || savedToken) {
      figma.ui.postMessage({ type: "init_storage", port: savedPort, token: savedToken });
    }
    postSession();
  } catch {}
})();

// Keep the reported page name current without requiring a reconnect.
try {
  if (typeof figma.on === "function") figma.on("currentpagechange", postSession);
} catch {}

figma.ui.onmessage = async (message) => {
  if (message.type === "set_title") {
    try { figma.ui.title = message.title; } catch {}
    return;
  }

  if (message.type === "save_storage") {
    try {
      if (message.port) await figma.clientStorage.setAsync("figma_mcp_unchained_port", String(message.port));
      if (message.token) await figma.clientStorage.setAsync("figma_mcp_unchained_token", String(message.token));
    } catch {}
    return;
  }

  if (message.type === "get_session") {
    postSession();
    return;
  }

  if (message.type === "cancel") {
    cancelCommand(message.id);
    return;
  }

  if (message.type !== "execute") return;

  const command = message.command;
  if (!command || isCancelled(command)) return;

  try {
    const result = await execute(command);
    if (isCancelled(command)) return;
    figma.ui.postMessage({ type: "result", id: command.id, command, result: { ok: true, result } });
  } catch (error) {
    if (isCancelled(command)) return;
    figma.ui.postMessage({
      type: "result",
      id: command.id,
      command,
      result: {
        ok: false,
        code: error && error.code ? error.code : "PLUGIN_ERROR",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
  }
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const MAX_TEXT_CHARS = 2000;
const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function commandError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

// Figma represents MIXED values and unreadable props with symbols that do not
// survive JSON. Collapse anything non-serializable to undefined.
function safeValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "symbol") return undefined;
  return value;
}

function jsonSafe(value, depth = 0) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "symbol" || typeof value === "function") return undefined;
  if (typeof value !== "object") return value;
  if (depth > 8) return undefined;
  if (Array.isArray(value)) {
    const items = [];
    for (const item of value.slice(0, 200)) {
      const next = jsonSafe(item, depth + 1);
      if (next !== undefined) items.push(next);
    }
    return items;
  }
  const output = {};
  let count = 0;
  for (const key of Object.keys(value)) {
    if (count++ > 200) break;
    const next = jsonSafe(value[key], depth + 1);
    if (next !== undefined) output[key] = next;
  }
  return output;
}

function truncateText(value, limit = MAX_TEXT_CHARS) {
  if (typeof value !== "string") return undefined;
  if (value.length <= limit) return value;
  return value.slice(0, limit) + "…";
}

function childrenOf(node) {
  return node && Array.isArray(node.children) ? node.children : [];
}

async function findNodeById(id) {
  if (!id) return null;
  try {
    if (typeof figma.getNodeByIdAsync === "function") {
      const node = await figma.getNodeByIdAsync(String(id));
      if (node) return node;
    }
  } catch {}
  try {
    return typeof figma.getNodeById === "function" ? figma.getNodeById(String(id)) : null;
  } catch {
    return null;
  }
}

function findNodeByName(name) {
  if (!name || !figma.currentPage) return null;
  try {
    if (typeof figma.currentPage.findOne === "function") {
      return figma.currentPage.findOne((node) => node.name === String(name));
    }
  } catch {}
  return null;
}

async function resolveTarget(payload) {
  if (payload.nodeId) {
    const node = await findNodeById(payload.nodeId);
    if (!node) throw commandError("NODE_NOT_FOUND", `Node not found for id "${payload.nodeId}"`);
    return node;
  }
  if (payload.name) {
    const node = findNodeByName(payload.name);
    if (!node) throw commandError("NODE_NOT_FOUND", `Node not found for name "${payload.name}"`);
    return node;
  }
  if (figma.currentPage && figma.currentPage.selection && figma.currentPage.selection.length > 0) {
    return figma.currentPage.selection[0];
  }
  if (!figma.currentPage) throw commandError("NO_SELECTION", "No current page is available");
  return figma.currentPage;
}

function walkNodes(root, options, visit) {
  const maxDepth = options.maxDepth === undefined ? 10 : options.maxDepth;
  const maxNodes = options.maxNodes === undefined ? 5000 : options.maxNodes;
  const state = { count: 0, truncated: false, visited: [] };

  function visitNode(node, depth, path) {
    if (!node) return;
    if (state.count >= maxNodes) {
      state.truncated = true;
      return;
    }
    state.count++;
    state.visited.push({ node, depth, path });
    visit(node, depth, path);
    if (depth >= maxDepth) return;
    for (const child of childrenOf(node)) {
      visitNode(child, depth + 1, path ? `${path}/${child.name}` : String(child.name));
    }
  }

  visitNode(root, 0, "");
  return state;
}

function bytesToBase64(bytes) {
  if (typeof figma.base64Encode === "function") return figma.base64Encode(bytes);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64) {
  if (typeof figma.base64Decode === "function") return figma.base64Decode(base64);
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToUtf8(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let text = "";
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  try { return decodeURIComponent(escape(text)); } catch { return text; }
}

function utf8ToBytes(text) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const bytes = [];
  for (let i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0xff);
  return new Uint8Array(bytes);
}

function imageFormatFromBytes(bytes) {
  if (!bytes || bytes.length < 4) return "original";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const head = bytes.length >= 6 ? String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]) : "";
  if (head === "GIF87a" || head === "GIF89a") return "gif";
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (riff === "RIFF" && webp === "WEBP") return "webp";
  }
  return "original";
}

function componentToHex(value) {
  const n = Math.max(0, Math.min(255, Math.round((Number(value) || 0) * 255)));
  return n.toString(16).padStart(2, "0");
}

function colorToHex(color, alpha) {
  if (!color || typeof color !== "object") return undefined;
  const a = alpha === undefined ? (typeof color.a === "number" ? color.a : 1) : alpha;
  const base = `#${componentToHex(color.r)}${componentToHex(color.g)}${componentToHex(color.b)}`;
  if (a >= 0.999) return base.toUpperCase();
  return `${base}${componentToHex(a)}`.toUpperCase();
}

function colorToCss(color, alpha) {
  if (!color || typeof color !== "object") return undefined;
  const r = Math.round((Number(color.r) || 0) * 255);
  const g = Math.round((Number(color.g) || 0) * 255);
  const b = Math.round((Number(color.b) || 0) * 255);
  const a = alpha === undefined ? (typeof color.a === "number" ? color.a : 1) : alpha;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

function hasBoundVariables(value) {
  return value && typeof value === "object" && value.boundVariables;
}

// ---------------------------------------------------------------------------
// Node serialization
// ---------------------------------------------------------------------------

function serializeNode(n, depth, maxDepth, state) {
  if (state.counter >= state.limit) {
    state.truncated = true;
    return { id: n.id, name: n.name, type: n.type, truncated: true };
  }
  state.counter++;

  const info = {
    id: n.id,
    name: n.name,
    type: n.type,
    x: safeValue("x" in n ? n.x : 0),
    y: safeValue("y" in n ? n.y : 0),
    width: safeValue("width" in n ? n.width : 0),
    height: safeValue("height" in n ? n.height : 0),
    visible: safeValue("visible" in n ? n.visible : true),
    opacity: safeValue("opacity" in n ? n.opacity : 1),
    fills: safeValue("fills" in n ? n.fills : undefined),
    strokes: safeValue("strokes" in n ? n.strokes : undefined),
    strokeWeight: safeValue("strokeWeight" in n ? n.strokeWeight : undefined),
    cornerRadius: safeValue("cornerRadius" in n ? n.cornerRadius : undefined),
    layoutMode: safeValue("layoutMode" in n ? n.layoutMode : undefined),
    itemSpacing: safeValue("itemSpacing" in n ? n.itemSpacing : undefined),
    paddingLeft: safeValue("paddingLeft" in n ? n.paddingLeft : undefined),
    paddingRight: safeValue("paddingRight" in n ? n.paddingRight : undefined),
    paddingTop: safeValue("paddingTop" in n ? n.paddingTop : undefined),
    paddingBottom: safeValue("paddingBottom" in n ? n.paddingBottom : undefined),
    primaryAxisAlignItems: safeValue("primaryAxisAlignItems" in n ? n.primaryAxisAlignItems : undefined),
    counterAxisAlignItems: safeValue("counterAxisAlignItems" in n ? n.counterAxisAlignItems : undefined),
    layoutSizingHorizontal: safeValue("layoutSizingHorizontal" in n ? n.layoutSizingHorizontal : undefined),
    layoutSizingVertical: safeValue("layoutSizingVertical" in n ? n.layoutSizingVertical : undefined),
    characters: truncateText(safeValue("characters" in n ? n.characters : undefined)),
    fontSize: safeValue("fontSize" in n ? n.fontSize : undefined),
    fontName: safeValue("fontName" in n ? n.fontName : undefined),
    lineHeight: safeValue("lineHeight" in n ? n.lineHeight : undefined),
    letterSpacing: safeValue("letterSpacing" in n ? n.letterSpacing : undefined),
    textAlignHorizontal: safeValue("textAlignHorizontal" in n ? n.textAlignHorizontal : undefined),
  };

  // Drop undefined keys so the payload stays small and JSON-safe.
  for (const key of Object.keys(info)) {
    if (info[key] === undefined) delete info[key];
  }

  if ("children" in n && depth < maxDepth) {
    info.children = n.children.map((c) => serializeNode(c, depth + 1, maxDepth, state));
  }
  return info;
}

const newState = (limit) => ({ counter: 0, limit, truncated: false });

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlAttributes(attributes) {
  return Object.keys(attributes)
    .filter((key) => attributes[key] !== undefined && attributes[key] !== null)
    .map((key) => ` ${key}="${xmlEscape(attributes[key])}"`)
    .join("");
}

function nodeTreeToXml(n, depth, maxDepth, state) {
  if (!n) return "";
  if (state.counter >= state.limit) {
    state.truncated = true;
    return "";
  }
  state.counter++;
  const tag = String(n.type || "NODE").toLowerCase();
  const attributes = {
    id: n.id,
    name: n.name,
    type: n.type,
    x: safeValue("x" in n ? n.x : undefined),
    y: safeValue("y" in n ? n.y : undefined),
    width: safeValue("width" in n ? n.width : undefined),
    height: safeValue("height" in n ? n.height : undefined),
    visible: safeValue("visible" in n ? n.visible : undefined),
    opacity: safeValue("opacity" in n ? n.opacity : undefined),
  };
  const inner = [];
  const characters = truncateText(safeValue("characters" in n ? n.characters : undefined));
  if (characters) inner.push(`<text>${xmlEscape(characters)}</text>`);
  if (depth < maxDepth) {
    for (const child of childrenOf(n)) {
      const serialized = nodeTreeToXml(child, depth + 1, maxDepth, state);
      if (serialized) inner.push(serialized);
    }
  }
  const body = inner.join("");
  return body
    ? `<${tag}${xmlAttributes(attributes)}>${body}</${tag}>`
    : `<${tag}${xmlAttributes(attributes)} />`;
}

// ---------------------------------------------------------------------------
// Variables and styles
// ---------------------------------------------------------------------------

function createBindingContext() {
  return {
    usages: new Map(),
    styleIds: new Map(),
    variables: new Map(),
    collections: new Map(),
    styles: new Map(),
  };
}

function addVariableUsage(ctx, id, node, field) {
  if (!id) return;
  let usages = ctx.usages.get(id);
  if (!usages) {
    usages = [];
    ctx.usages.set(id, usages);
  }
  if (usages.length < 200) usages.push({ node, field });
}

function aliasValues(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectNodeBindings(node, ctx) {
  const bound = node.boundVariables;
  if (bound && typeof bound === "object") {
    for (const field of Object.keys(bound)) {
      for (const alias of aliasValues(bound[field])) {
        if (alias && alias.type === "VARIABLE_ALIAS") addVariableUsage(ctx, alias.id, node, field);
      }
    }
  }

  for (const collection of ["fills", "strokes", "effects", "layoutGrids"]) {
    const values = node[collection];
    if (!Array.isArray(values)) continue;
    values.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      if (item.boundVariables) {
        for (const field of Object.keys(item.boundVariables)) {
          for (const alias of aliasValues(item.boundVariables[field])) {
            if (alias && alias.type === "VARIABLE_ALIAS") {
              addVariableUsage(ctx, alias.id, node, `${collection}[${index}].${field}`);
            }
          }
        }
      }
      if (Array.isArray(item.gradientStops)) {
        item.gradientStops.forEach((stop, stopIndex) => {
          if (!stop || !stop.boundVariables) return;
          for (const field of Object.keys(stop.boundVariables)) {
            for (const alias of aliasValues(stop.boundVariables[field])) {
              if (alias && alias.type === "VARIABLE_ALIAS") {
                addVariableUsage(
                  ctx,
                  alias.id,
                  node,
                  `${collection}[${index}].gradientStops[${stopIndex}].${field}`,
                );
              }
            }
          }
        });
      }
    });
  }

  for (const field of ["fillStyleId", "strokeStyleId", "effectStyleId", "textStyleId", "gridStyleId"]) {
    const id = safeValue(node[field]);
    if (typeof id !== "string" || !id || id === "MIXED") continue;
    let usages = ctx.styleIds.get(id);
    if (!usages) {
      usages = [];
      ctx.styleIds.set(id, usages);
    }
    if (usages.length < 200) usages.push({ node, field });
  }
}

async function loadVariable(ctx, id) {
  if (ctx.variables.has(id)) return ctx.variables.get(id);
  let variable = null;
  try {
    if (figma.variables && typeof figma.variables.getVariableByIdAsync === "function") {
      variable = await figma.variables.getVariableByIdAsync(id);
    }
  } catch {}
  if (!variable) {
    try {
      if (figma.variables && typeof figma.variables.getVariableById === "function") {
        variable = figma.variables.getVariableById(id);
      }
    } catch {}
  }
  ctx.variables.set(id, variable);
  return variable;
}

async function loadCollection(ctx, id) {
  if (!id) return null;
  if (ctx.collections.has(id)) return ctx.collections.get(id);
  let collection = null;
  try {
    if (figma.variables && typeof figma.variables.getVariableCollectionByIdAsync === "function") {
      collection = await figma.variables.getVariableCollectionByIdAsync(id);
    }
  } catch {}
  if (!collection) {
    try {
      if (figma.variables && typeof figma.variables.getVariableCollectionById === "function") {
        collection = figma.variables.getVariableCollectionById(id);
      }
    } catch {}
  }
  ctx.collections.set(id, collection);
  return collection;
}

async function loadStyle(ctx, id) {
  if (ctx.styles.has(id)) return ctx.styles.get(id);
  let style = null;
  try {
    if (typeof figma.getStyleByIdAsync === "function") style = await figma.getStyleByIdAsync(id);
  } catch {}
  if (!style) {
    try {
      if (typeof figma.getStyleById === "function") style = figma.getStyleById(id);
    } catch {}
  }
  ctx.styles.set(id, style);
  return style;
}

async function resolveStyleRefs(ctx) {
  for (const id of ctx.styleIds.keys()) {
    const style = await loadStyle(ctx, id);
    if (!style || !style.boundVariables) continue;
    const bound = style.boundVariables;
    for (const field of Object.keys(bound)) {
      for (const alias of aliasValues(bound[field])) {
        if (alias && alias.type === "VARIABLE_ALIAS") {
          addVariableUsage(ctx, alias.id, null, `style:${id}.${field}`);
        }
      }
    }
  }
}

async function resolveAliasChain(value, ctx, consumer, depth = 0) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const output = [];
    for (const item of value.slice(0, 50)) output.push(await resolveAliasChain(item, ctx, consumer, depth + 1));
    return output;
  }
  if (value.type === "VARIABLE_ALIAS" && depth < 10) {
    const variable = await loadVariable(ctx, value.id);
    if (!variable) return value;
    let next;
    if (consumer && typeof variable.resolveForConsumer === "function") {
      try { next = variable.resolveForConsumer(consumer).value; } catch {}
    }
    if (next === undefined && variable.valuesByMode) {
      const collection = await loadCollection(ctx, variable.variableCollectionId);
      const modeId = collection && collection.defaultModeId;
      next = modeId ? variable.valuesByMode[modeId] : Object.values(variable.valuesByMode)[0];
    }
    return resolveAliasChain(next, ctx, consumer, depth + 1);
  }
  if (value.color && value.opacity) {
    const color = await resolveAliasChain(value.color, ctx, consumer, depth + 1);
    const opacity = await resolveAliasChain(value.opacity, ctx, consumer, depth + 1);
    return { color, opacity };
  }
  return value;
}

function displayVariableValue(value, resolvedType) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => displayVariableValue(item, resolvedType));
  if (typeof value === "object") {
    if (typeof value.r === "number" && typeof value.g === "number" && typeof value.b === "number") {
      return colorToHex(value, typeof value.a === "number" ? value.a : undefined);
    }
    if (value.color && value.opacity !== undefined) {
      return {
        color: displayVariableValue(value.color, "COLOR"),
        opacity: displayVariableValue(value.opacity, "FLOAT"),
      };
    }
    if (value.type === "VARIABLE_ALIAS") return `{${value.id}}`;
  }
  return jsonSafe(value);
}

async function resolveVariablesForContext(ctx) {
  const definitions = [];
  const values = {};
  const names = new Map();

  for (const [id, usages] of ctx.usages) {
    const variable = await loadVariable(ctx, id);
    const consumer = usages.find((usage) => usage.node)?.node || null;
    const collection = variable ? await loadCollection(ctx, variable.variableCollectionId) : null;
    const name = variable && variable.name ? variable.name : `(unresolved ${id})`;
    names.set(id, name);

    let resolved;
    if (variable) {
      let raw;
      if (consumer && typeof variable.resolveForConsumer === "function") {
        try { raw = variable.resolveForConsumer(consumer).value; } catch {}
      }
      if (raw === undefined && variable.valuesByMode) {
        const modeId = collection && collection.defaultModeId;
        raw = modeId ? variable.valuesByMode[modeId] : Object.values(variable.valuesByMode)[0];
      }
      resolved = await resolveAliasChain(raw, ctx, consumer);
    }

    const value = displayVariableValue(resolved, variable ? variable.resolvedType : undefined);
    if (!(name in values)) values[name] = value;

    definitions.push({
      id,
      key: variable ? variable.key : undefined,
      name,
      description: variable ? variable.description : undefined,
      resolvedType: variable ? variable.resolvedType : undefined,
      remote: variable ? variable.remote : undefined,
      collection: collection
        ? { id: collection.id, name: collection.name, modes: jsonSafe(collection.modes), defaultModeId: collection.defaultModeId }
        : variable
          ? { id: variable.variableCollectionId }
          : undefined,
      scopes: variable ? jsonSafe(variable.scopes) : undefined,
      codeSyntax: variable ? jsonSafe(variable.codeSyntax) : undefined,
      valuesByMode: variable ? jsonSafe(variable.valuesByMode) : undefined,
      resolvedValue: value,
      usedBy: usages.slice(0, 50).map((usage) => ({
        nodeId: usage.node ? usage.node.id : undefined,
        nodeName: usage.node ? usage.node.name : undefined,
        field: usage.field,
      })),
    });
  }

  definitions.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { definitions, values, names };
}

function styleDefinitionsFromContext(ctx) {
  const styles = {};
  const definitions = [];
  for (const [id, usages] of ctx.styleIds) {
    const style = ctx.styles.get(id);
    const definition = {
      id,
      key: style ? style.key : undefined,
      name: style && style.name ? style.name : `(unresolved ${id})`,
      type: style ? style.type : undefined,
      description: style ? style.description : undefined,
      usedBy: usages.slice(0, 50).map((usage) => ({
        nodeId: usage.node ? usage.node.id : undefined,
        nodeName: usage.node ? usage.node.name : undefined,
        field: usage.field,
      })),
    };
    definitions.push(definition);
    if (!(definition.name in styles)) styles[definition.name] = { id, key: definition.key, type: definition.type };
  }
  definitions.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { styles, definitions };
}

function boundVariableNames(bound, names) {
  if (!bound || typeof bound !== "object") return undefined;
  const output = {};
  for (const field of Object.keys(bound)) {
    const aliases = aliasValues(bound[field]);
    const mapped = aliases
      .map((alias) => (alias && alias.type === "VARIABLE_ALIAS" ? names.get(alias.id) || alias.id : undefined))
      .filter(Boolean);
    if (mapped.length === 1) output[field] = mapped[0];
    else if (mapped.length > 1) output[field] = mapped;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

// ---------------------------------------------------------------------------
// Design context
// ---------------------------------------------------------------------------

function serializePaint(paint, names, index) {
  if (!paint || typeof paint !== "object") return undefined;
  const output = { type: paint.type };
  if (paint.type === "SOLID") {
    output.color = colorToHex(paint.color, typeof paint.opacity === "number" ? paint.opacity : undefined);
    output.opacity = paint.opacity;
  } else if (String(paint.type).indexOf("GRADIENT") === 0) {
    output.gradientTransform = jsonSafe(paint.gradientTransform);
    output.gradientStops = (paint.gradientStops || []).slice(0, 20).map((stop) => ({
      position: stop.position,
      color: colorToHex(stop.color, typeof stop.color === "object" && typeof stop.color.a === "number" ? stop.color.a : undefined),
      boundVariables: names && names.size > 0 ? boundVariableNames(stop.boundVariables, names) : undefined,
    }));
    output.opacity = paint.opacity;
  } else if (paint.type === "IMAGE") {
    output.imageHash = paint.imageHash;
    output.scaleMode = paint.scaleMode;
    output.imageTransform = jsonSafe(paint.imageTransform);
    output.scalingFactor = paint.scalingFactor;
    output.rotation = paint.rotation;
  } else if (paint.type === "VIDEO") {
    output.videoHash = paint.videoHash;
    output.scaleMode = paint.scaleMode;
  } else if (paint.type === "PATTERN") {
    output.sourceNodeId = paint.sourceNodeId;
    output.tileType = paint.tileType;
    output.scalingFactor = paint.scalingFactor;
    output.spacing = jsonSafe(paint.spacing);
  } else if (paint.type === "SHADER") {
    output.shaderId = paint.id;
    output.properties = jsonSafe(paint.properties);
    output.propertyMetadata = jsonSafe(paint.propertyMetadata);
  }
  output.visible = paint.visible;
  output.blendMode = paint.blendMode;
  output.boundVariables = names && names.size > 0 ? boundVariableNames(paint.boundVariables, names) : undefined;
  if (!output.boundVariables) delete output.boundVariables;
  output.index = index;
  return output;
}

function serializeEffect(effect, names, index) {
  if (!effect || typeof effect !== "object") return undefined;
  const output = {
    type: effect.type,
    visible: effect.visible,
    blendMode: effect.blendMode,
    index,
  };
  if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
    output.color = colorToHex(effect.color, typeof effect.color === "object" && typeof effect.color.a === "number" ? effect.color.a : undefined);
    output.offset = jsonSafe(effect.offset);
    output.radius = effect.radius;
    output.spread = effect.spread;
  } else if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
    output.radius = effect.radius;
  } else if (effect.type === "NOISE" || effect.type === "TEXTURE") {
    output.noiseType = effect.noiseType;
    output.density = effect.density;
  } else if (effect.type === "SHADER") {
    output.shaderId = effect.id;
    output.properties = jsonSafe(effect.properties);
    output.propertyMetadata = jsonSafe(effect.propertyMetadata);
  }
  output.boundVariables = names && names.size > 0 ? boundVariableNames(effect.boundVariables, names) : undefined;
  if (!output.boundVariables) delete output.boundVariables;
  return output;
}

function serializeDesignNode(node, depth, maxDepth, state, context) {
  if (state.count >= state.limit) {
    state.truncated = true;
    return { id: node.id, name: node.name, type: node.type, truncated: true };
  }
  state.count++;

  const output = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: safeValue("visible" in node ? node.visible : undefined),
    opacity: safeValue("opacity" in node ? node.opacity : undefined),
    blendMode: safeValue("blendMode" in node ? node.blendMode : undefined),
    x: safeValue("x" in node ? node.x : undefined),
    y: safeValue("y" in node ? node.y : undefined),
    width: safeValue("width" in node ? node.width : undefined),
    height: safeValue("height" in node ? node.height : undefined),
    rotation: safeValue("rotation" in node ? node.rotation : undefined),
    constraints: safeValue("constraints" in node ? node.constraints : undefined),
    cornerRadius: safeValue("cornerRadius" in node ? node.cornerRadius : undefined),
    topLeftRadius: safeValue("topLeftRadius" in node ? node.topLeftRadius : undefined),
    topRightRadius: safeValue("topRightRadius" in node ? node.topRightRadius : undefined),
    bottomLeftRadius: safeValue("bottomLeftRadius" in node ? node.bottomLeftRadius : undefined),
    bottomRightRadius: safeValue("bottomRightRadius" in node ? node.bottomRightRadius : undefined),
    minWidth: safeValue("minWidth" in node ? node.minWidth : undefined),
    maxWidth: safeValue("maxWidth" in node ? node.maxWidth : undefined),
    minHeight: safeValue("minHeight" in node ? node.minHeight : undefined),
    maxHeight: safeValue("maxHeight" in node ? node.maxHeight : undefined),
  };

  if ("layoutMode" in node) {
    output.layout = {
      mode: node.layoutMode,
      itemSpacing: node.itemSpacing,
      counterAxisSpacing: node.counterAxisSpacing,
      paddingTop: node.paddingTop,
      paddingRight: node.paddingRight,
      paddingBottom: node.paddingBottom,
      paddingLeft: node.paddingLeft,
      primaryAxisAlignItems: node.primaryAxisAlignItems,
      counterAxisAlignItems: node.counterAxisAlignItems,
      primaryAxisSizingMode: node.primaryAxisSizingMode,
      counterAxisSizingMode: node.counterAxisSizingMode,
      layoutSizingHorizontal: node.layoutSizingHorizontal,
      layoutSizingVertical: node.layoutSizingVertical,
      layoutWrap: node.layoutWrap,
      itemReverseZIndex: node.itemReverseZIndex,
      strokesIncludedInLayout: node.strokesIncludedInLayout,
    };
  }

  if (Array.isArray(node.fills)) {
    output.fills = node.fills.slice(0, 20).map((paint, index) => serializePaint(paint, context.variableNames, index));
    for (const paint of node.fills) {
      if (paint && paint.type === "SOLID") {
        const hex = colorToHex(paint.color, typeof paint.opacity === "number" ? paint.opacity : undefined);
        if (hex) context.summary.colors[hex] = (context.summary.colors[hex] || 0) + 1;
      }
    }
  }
  if (Array.isArray(node.strokes)) {
    output.strokes = node.strokes.slice(0, 20).map((paint, index) => serializePaint(paint, context.variableNames, index));
    for (const paint of node.strokes) {
      if (paint && paint.type === "SOLID") {
        const hex = colorToHex(paint.color, typeof paint.opacity === "number" ? paint.opacity : undefined);
        if (hex) context.summary.colors[hex] = (context.summary.colors[hex] || 0) + 1;
      }
    }
  }
  if (Array.isArray(node.effects)) {
    output.effects = node.effects.slice(0, 20).map((effect, index) => serializeEffect(effect, context.variableNames, index));
    for (const effect of node.effects) {
      if (effect && effect.type) context.summary.effects[effect.type] = (context.summary.effects[effect.type] || 0) + 1;
    }
  }

  if (context.includeVariables) {
    const bound = boundVariableNames(node.boundVariables, context.variableNames);
    if (bound) output.variables = bound;
  }

  if (Array.isArray(node.layoutGrids) && node.layoutGrids.length > 0) {
    output.layoutGrids = jsonSafe(node.layoutGrids);
  }

  if (typeof node.strokeWeight === "number") output.strokeWeight = node.strokeWeight;
  if (node.strokeAlign) output.strokeAlign = node.strokeAlign;
  if (node.strokeCap) output.strokeCap = node.strokeCap;
  if (node.strokeJoin) output.strokeJoin = node.strokeJoin;
  if (Array.isArray(node.dashPattern) && node.dashPattern.length > 0) output.dashPattern = node.dashPattern;

  if ("characters" in node) {
    output.text = {
      characters: truncateText(node.characters),
      fontName: safeValue(node.fontName),
      fontSize: safeValue(node.fontSize),
      fontWeight: safeValue(node.fontWeight),
      lineHeight: safeValue(node.lineHeight),
      letterSpacing: safeValue(node.letterSpacing),
      textAlignHorizontal: safeValue(node.textAlignHorizontal),
      textAlignVertical: safeValue(node.textAlignVertical),
      textCase: safeValue(node.textCase),
      textDecoration: safeValue(node.textDecoration),
      paragraphSpacing: safeValue(node.paragraphSpacing),
      paragraphIndent: safeValue(node.paragraphIndent),
      textAutoResize: safeValue(node.textAutoResize),
      textTruncation: safeValue(node.textTruncation),
    };
    const font = node.fontName && typeof node.fontName === "object" ? `${node.fontName.family} ${node.fontName.style}` : "unknown";
    const size = typeof node.fontSize === "number" ? node.fontSize : "?";
    const key = `${font} @ ${size}px`;
    context.summary.typography[key] = (context.summary.typography[key] || 0) + 1;
    context.summary.textCount++;
  }

  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET" || node.type === "INSTANCE") {
    const component = { type: node.type };
    if (node.key) component.key = node.key;
    if (node.componentId) component.componentId = node.componentId;
    if (node.componentPropertyDefinitions) {
      component.propertyDefinitions = jsonSafe(node.componentPropertyDefinitions);
    }
    if (node.componentProperties) {
      component.properties = jsonSafe(node.componentProperties);
    }
    if (node.variantProperties) component.variantProperties = jsonSafe(node.variantProperties);
    if (node.type === "INSTANCE") {
      const main = node.mainComponent;
      if (main) component.mainComponent = { id: main.id, name: main.name, key: main.key, type: main.type };
      if (node.componentPropertyReferences) component.propertyReferences = jsonSafe(node.componentPropertyReferences);
    }
    output.component = component;
    const name = node.name || node.id;
    context.summary.components[name] = (context.summary.components[name] || 0) + 1;
  }

  if (context.includeStyles) {
    const styleFields = ["fillStyleId", "strokeStyleId", "effectStyleId", "textStyleId", "gridStyleId"];
    for (const field of styleFields) {
      const id = safeValue(node[field]);
      if (typeof id !== "string" || !id || id === "MIXED") continue;
      const style = context.styleNames.get(id);
      if (!style) continue;
      if (!output.styles) output.styles = {};
      output.styles[field] = style;
    }
  }

  if ("layoutMode" in node) {
    if (typeof node.itemSpacing === "number") {
      const key = `${node.itemSpacing}`;
      context.summary.spacing[key] = (context.summary.spacing[key] || 0) + 1;
    }
    for (const key of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
      if (typeof node[key] === "number") {
        context.summary.spacing[node[key]] = (context.summary.spacing[node[key]] || 0) + 1;
      }
    }
  }
  if (typeof node.cornerRadius === "number") {
    context.summary.radii[node.cornerRadius] = (context.summary.radii[node.cornerRadius] || 0) + 1;
  }

  if (depth < maxDepth) {
    const children = childrenOf(node);
    if (children.length > 0) {
      output.children = children.slice(0, state.limit - state.count).map((child) =>
        serializeDesignNode(child, depth + 1, maxDepth, state, context),
      );
    }
  }

  for (const key of Object.keys(output)) {
    if (output[key] === undefined) delete output[key];
  }
  if (output.layout) {
    for (const key of Object.keys(output.layout)) {
      if (output.layout[key] === undefined) delete output.layout[key];
    }
  }
  return output;
}

async function exportPngBase64(target, maxDimension, requestedScale) {
  if (!target || typeof target.exportAsync !== "function") return null;
  const width = Number(target.width) || 0;
  const height = Number(target.height) || 0;
  let scale = requestedScale === undefined ? 2 : requestedScale;
  if (maxDimension && width > 0 && height > 0) {
    scale = Math.min(scale, maxDimension / Math.max(width, height));
  }
  scale = Math.max(0.01, Math.min(4, scale));
  try {
    const bytes = await target.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale } });
    if (bytes.byteLength > MAX_SCREENSHOT_BYTES) return null;
    return {
      base64: bytesToBase64(bytes),
      mimeType: "image/png",
      byteLength: bytes.byteLength,
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// FigJam
// ---------------------------------------------------------------------------

function figjamNodeAttributes(node) {
  const attributes = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: safeValue("x" in node ? node.x : undefined),
    y: safeValue("y" in node ? node.y : undefined),
    width: safeValue("width" in node ? node.width : undefined),
    height: safeValue("height" in node ? node.height : undefined),
    visible: safeValue("visible" in node ? node.visible : undefined),
    opacity: safeValue("opacity" in node ? node.opacity : undefined),
  };
  if (node.type === "SHAPE_WITH_TEXT") attributes.shapeType = node.shapeType;
  if (node.type === "CONNECTOR") {
    attributes.connectorLineType = node.connectorLineType;
    if (node.connectorStart) {
      attributes.startNodeId = node.connectorStart.endpointNodeId;
      attributes.startMagnet = node.connectorStart.magnet;
      if (node.connectorStart.position) attributes.startPosition = `${node.connectorStart.position.x},${node.connectorStart.position.y}`;
    }
    if (node.connectorEnd) {
      attributes.endNodeId = node.connectorEnd.endpointNodeId;
      attributes.endMagnet = node.connectorEnd.magnet;
      if (node.connectorEnd.position) attributes.endPosition = `${node.connectorEnd.position.x},${node.connectorEnd.position.y}`;
    }
  }
  if (node.type === "STICKY") {
    attributes.authorName = node.authorName;
    attributes.authorVisible = node.authorVisible;
    attributes.isWideWidth = node.isWideWidth;
  }
  if (node.type === "SECTION") attributes.sectionContentsHidden = node.sectionContentsHidden;
  if (node.type === "TABLE") {
    attributes.numRows = node.numRows;
    attributes.numColumns = node.numColumns;
  }
  if (node.type === "CODE_BLOCK") attributes.codeLanguage = node.codeLanguage;
  if (node.type === "WIDGET") attributes.widgetId = node.widgetId;
  if (node.type === "MEDIA" && node.mediaData) attributes.mediaHash = node.mediaData.hash;
  return attributes;
}

function figjamInnerXml(node) {
  const inner = [];
  const text =
    (node.text && typeof node.text.characters === "string" && node.text.characters) ||
    (node.type === "CODE_BLOCK" ? node.code : undefined) ||
    (typeof node.characters === "string" ? node.characters : undefined);
  if (text) inner.push(`<text>${xmlEscape(truncateText(text) || "")}</text>`);
  if (node.type === "EMBED" && node.embedData) inner.push(`<embed>${xmlEscape(JSON.stringify(jsonSafe(node.embedData)))}</embed>`);
  if (node.type === "LINK_UNFURL" && node.linkUnfurlData) {
    inner.push(`<link>${xmlEscape(JSON.stringify(jsonSafe(node.linkUnfurlData)))}</link>`);
  }
  if (node.type === "TABLE" && typeof node.cellAt === "function") {
    const rows = [];
    for (let row = 0; row < Math.min(node.numRows, 50); row++) {
      const cells = [];
      for (let column = 0; column < Math.min(node.numColumns, 20); column++) {
        try {
          const cell = node.cellAt(row, column);
          cells.push(`<cell row="${row}" column="${column}" text="${xmlEscape(truncateText(cell && cell.text && cell.text.characters) || "")}" />`);
        } catch {}
      }
      rows.push(cells.join(""));
    }
    if (rows.length > 0) inner.push(`<table>${rows.join("")}</table>`);
  }
  return inner.join("");
}

function figjamTreeToXml(node, depth, maxDepth, state) {
  if (!node) return "";
  if (state.counter >= state.limit) {
    state.truncated = true;
    return "";
  }
  state.counter++;
  const tag = String(node.type || "NODE").toLowerCase();
  const inner = [figjamInnerXml(node)];
  if (depth < maxDepth) {
    for (const child of childrenOf(node)) inner.push(figjamTreeToXml(child, depth + 1, maxDepth, state));
  }
  const body = inner.join("");
  return body
    ? `<${tag}${xmlAttributes(figjamNodeAttributes(node))}>${body}</${tag}>`
    : `<${tag}${xmlAttributes(figjamNodeAttributes(node))} />`;
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

function motionEasingToCss(easing) {
  if (!easing || typeof easing !== "object") return "ease";
  if (easing.type === "LINEAR") return "linear";
  if (easing.type === "EASE_IN") return "ease-in";
  if (easing.type === "EASE_OUT") return "ease-out";
  if (easing.type === "EASE_IN_AND_OUT") return "ease-in-out";
  if (easing.type === "HOLD") return "steps(1, end)";
  if (easing.type === "CUSTOM_CUBIC_BEZIER" && easing.easingFunctionCubicBezier) {
    const curve = easing.easingFunctionCubicBezier;
    return `cubic-bezier(${curve.x1}, ${curve.y1}, ${curve.x2}, ${curve.y2})`;
  }
  if (easing.type === "CUSTOM_SPRING") return "cubic-bezier(0.34, 1.56, 0.64, 1)";
  return "ease";
}

const CSS_FIELD_MAP = {
  OPACITY: { property: "opacity", unit: "" },
  WIDTH: { property: "width", unit: "px" },
  HEIGHT: { property: "height", unit: "px" },
  CORNER_RADIUS: { property: "border-radius", unit: "px" },
  STROKE_WEIGHT: { property: "border-width", unit: "px" },
  TRANSLATION_X: { property: "transform", transform: "translateX", unit: "px" },
  TRANSLATION_Y: { property: "transform", transform: "translateY", unit: "px" },
  ROTATION: { property: "transform", transform: "rotate", unit: "deg" },
  SCALE_X: { property: "transform", transform: "scaleX", unit: "" },
  SCALE_Y: { property: "transform", transform: "scaleY", unit: "" },
  STACK_SPACING: { property: "gap", unit: "px" },
  STACK_PADDING_LEFT: { property: "padding-left", unit: "px" },
  STACK_PADDING_TOP: { property: "padding-top", unit: "px" },
  STACK_PADDING_RIGHT: { property: "padding-right", unit: "px" },
  STACK_PADDING_BOTTOM: { property: "padding-bottom", unit: "px" },
};

function keyframeValueNumber(value) {
  if (!value || typeof value !== "object") return undefined;
  if (value.type === "FLOAT" && typeof value.value === "number") return value.value;
  if (value.type === "BOOL" && typeof value.value === "boolean") return value.value ? 1 : 0;
  if (value.type === "COLOR" && value.value && typeof value.value === "object") {
    return colorToCss(value.value, typeof value.value.a === "number" ? value.value.a : 1);
  }
  return undefined;
}

function cssDeclarationForField(field, value) {
  const number = keyframeValueNumber(value);
  if (number === undefined) return undefined;
  const mapping = CSS_FIELD_MAP[field];
  if (!mapping) return undefined;
  if (field === "OPACITY") return `opacity: ${number};`;
  if (field === "TRANSLATION_XY") return undefined;
  if (field === "SCALE_XY") return `transform: scale(${number});`;
  if (mapping.transform) {
    return `transform: ${mapping.transform}(${number}${mapping.unit});`;
  }
  return `${mapping.property}: ${number}${mapping.unit};`;
}

function motionKeyframesForBinding(field, binding) {
  const frames = [];
  const seen = new Set();
  const push = (position, value, easing) => {
    const declaration = cssDeclarationForField(field, value);
    if (!declaration) return;
    const key = `${position}`;
    if (seen.has(key)) return;
    seen.add(key);
    frames.push({ position, declaration, easing });
  };

  if (binding.baseValue) push(0, binding.baseValue, undefined);
  for (const keyframe of binding.keyframes || []) {
    if (typeof keyframe.timelinePosition === "number") {
      push(keyframe.timelinePosition, keyframe.value, keyframe.easing);
    }
  }
  return frames;
}

function generateMotionSnippets(node, data) {
  const css = [];
  const motion = [];
  const warnings = [];
  const bindings = [];

  for (const field of Object.keys(data.animations || {})) {
    const binding = data.animations[field];
    if (!binding || !Array.isArray(binding.tracks)) continue;
    const keyframes = [];
    for (const track of binding.tracks) {
      for (const keyframe of track.keyframes || []) {
        keyframes.push(keyframe);
        if (track.keyframeOperation && track.keyframeOperation !== "SET") {
          warnings.push(`${field}: keyframe operation ${track.keyframeOperation} is not reproduced exactly in CSS.`);
        }
      }
    }
    bindings.push({
      field,
      baseValue: binding.baseValue,
      timelineDuration: binding.timelineDuration,
      keyframes,
    });
  }

  for (const field of Object.keys(data.manualKeyframeTracks || {})) {
    const binding = data.manualKeyframeTracks[field];
    if (!binding || !Array.isArray(binding.keyframes)) continue;
    bindings.push({
      field,
      baseValue: binding.baseValue,
      timelineDuration: undefined,
      keyframes: binding.keyframes,
    });
  }

  const safeId = String(node.id).replace(/[^a-zA-Z0-9_-]+/g, "-");
  for (const binding of bindings) {
    const frames = motionKeyframesForBinding(binding.field, binding);
    if (frames.length === 0) {
      if (!CSS_FIELD_MAP[binding.field]) warnings.push(`${binding.field}: no CSS snippet generator for this field.`);
      continue;
    }
    const maxPosition = Math.max.apply(
      null,
      frames.map((frame) => frame.position).concat([binding.timelineDuration || 0, 1]),
    );
    const duration = Math.max(0.001, maxPosition);
    const ordered = frames
      .map((frame) => ({ ...frame, percent: Math.max(0, Math.min(100, (frame.position / duration) * 100)) }))
      .sort((a, b) => a.percent - b.percent);

    const lines = [];
    for (const frame of ordered) {
      const timing = frame.easing ? ` animation-timing-function: ${motionEasingToCss(frame.easing)};` : "";
      lines.push(`  ${Math.round(frame.percent * 1000) / 1000}% { ${frame.declaration}${timing} }`);
    }
    const name = `figma-${safeId}-${String(binding.field).toLowerCase()}`;
    css.push(`@keyframes ${name} {\n${lines.join("\n")}\n}`);

    const values = ordered.map((frame) => keyframeValueNumber(
      { type: typeof frame.declaration === "string" && frame.declaration.indexOf("rgba") >= 0 ? "COLOR" : "FLOAT", value: undefined },
    ));
    void values;

    const numbers = [];
    for (const frame of frames) {
      const number = keyframeValueNumber({ type: "FLOAT", value: undefined });
      void number;
    }

    const motionValues = [];
    for (const frame of ordered) {
      const match = frame.declaration.match(/^[^:]+:\s*(-?[0-9.]+)/);
      if (match) motionValues.push(Number(match[1]));
      else if (frame.declaration.indexOf("rgba") >= 0) {
        const rgba = frame.declaration.match(/rgba\([^)]+\)/);
        if (rgba) motionValues.push(rgba[0]);
      }
    }
    if (motionValues.length > 1) {
      const easing = ordered.find((frame) => frame.easing)?.easing;
      motion.push(
        `// ${node.name} (${node.id})\nanimate(element, {\n  ${binding.field.toLowerCase()}: ${JSON.stringify(motionValues)}\n}, { duration: ${Math.round(duration * 1000) / 1000}, easing: ${JSON.stringify(motionEasingToCss(easing))} });`,
      );
    }
  }

  return { css, motion, warnings };
}

function collectMotion(node, path) {
  const animations = jsonSafe(node.animations) || {};
  const manualKeyframeTracks = jsonSafe(node.manualKeyframeTracks) || {};
  const animationStyles = jsonSafe(node.animationStyles) || [];
  const timelines = jsonSafe(node.timelines) || [];
  const data = {
    id: node.id,
    name: node.name,
    type: node.type,
    path,
    hasAnimation:
      Object.keys(animations).length > 0 ||
      Object.keys(manualKeyframeTracks).length > 0 ||
      (Array.isArray(animationStyles) && animationStyles.length > 0),
    timelines,
    animationStyles,
    animations,
    manualKeyframeTracks,
  };
  const snippets = generateMotionSnippets(node, data);
  data.snippets = { css: snippets.css, motion: snippets.motion };
  data.warnings = snippets.warnings;
  return data;
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

async function shaderCatalog() {
  if (typeof figma.listAvailableShaders !== "function") {
    throw commandError("LIBRARY_UNAVAILABLE", "This Figma build does not expose figma.listAvailableShaders().");
  }
  const shaders = await figma.listAvailableShaders();
  const map = new Map();
  for (const shader of shaders) map.set(shader.id, shader);
  return { shaders, map };
}

function shaderUsageForNode(node) {
  const usages = [];
  for (const collection of ["fills", "strokes", "effects"]) {
    const values = node[collection];
    if (!Array.isArray(values)) continue;
    values.forEach((item, index) => {
      if (!item || item.type !== "SHADER") return;
      usages.push({
        nodeId: node.id,
        nodeName: node.name,
        collection,
        index,
        shaderId: item.id,
        properties: jsonSafe(item.properties),
        propertyMetadata: jsonSafe(item.propertyMetadata),
      });
    });
  }
  return usages;
}

// ---------------------------------------------------------------------------
// Mermaid flowchart subset
// ---------------------------------------------------------------------------

function stripMermaidQuotes(value) {
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseMermaidNodeToken(raw) {
  const token = String(raw).trim();
  const match = token.match(/^([A-Za-z0-9_][A-Za-z0-9_-]*)([\s\S]*)$/);
  if (!match) return null;
  const id = match[1];
  const rest = match[2].trim();
  if (!rest) return { id, label: id, shape: "SQUARE", explicit: false };

  let label = rest;
  let shape = "SQUARE";
  if (rest.startsWith("((") && rest.endsWith("))")) {
    label = rest.slice(2, -2);
    shape = "ELLIPSE";
  } else if (rest.startsWith("([") && rest.endsWith("])")) {
    label = rest.slice(2, -2);
    shape = "ROUNDED_RECTANGLE";
  } else if (rest.startsWith("[(") && rest.endsWith(")]")) {
    label = rest.slice(2, -2);
    shape = "ENG_DATABASE";
  } else if (rest.startsWith("[[") && rest.endsWith("]]")) {
    label = rest.slice(2, -2);
    shape = "SQUARE";
  } else if (rest.startsWith("(") && rest.endsWith(")")) {
    label = rest.slice(1, -1);
    shape = "ROUNDED_RECTANGLE";
  } else if (rest.startsWith("{") && rest.endsWith("}")) {
    label = rest.slice(1, -1);
    shape = "DIAMOND";
  } else if (rest.startsWith("[") && rest.endsWith("]")) {
    label = rest.slice(1, -1);
    shape = "SQUARE";
  } else if (rest.startsWith(">") && rest.endsWith("]")) {
    label = rest.slice(1, -1);
    shape = "ARROW_RIGHT";
  } else if (rest.startsWith("[/") && rest.endsWith("/]")) {
    label = rest.slice(2, -2);
    shape = "PARALLELOGRAM_RIGHT";
  } else {
    return null;
  }
  return { id, label: stripMermaidQuotes(label), shape, explicit: true };
}

function parseMermaidFlowchart(source) {
  const lines = String(source).split(/\r?\n/).map((line) => line.trim());
  let started = false;
  let direction = null;
  const nodes = new Map();
  const edges = [];
  const warnings = [];

  for (const original of lines) {
    if (!original) continue;
    if (original.indexOf("%%") === 0) continue;
    if (original === "---" || original.indexOf("---") === 0 && original.length > 3) continue;
    if (/^(flowchart|graph)\b/i.test(original)) {
      const parts = original.split(/\s+/);
      if (parts[1]) direction = parts[1].toUpperCase();
      started = true;
      continue;
    }
    if (/^(classDef|class |style |linkStyle|click |subgraph|end\b|accTitle|accDescr)/i.test(original)) {
      warnings.push(`Skipped unsupported Mermaid directive: ${truncateText(original, 160)}`);
      continue;
    }
    if (!started) {
      if (/^(sequenceDiagram|stateDiagram|gantt|erDiagram|classDiagram|pie|mindmap|journey|timeline|quadrantChart|gitGraph|C4Context)/i.test(original)) {
        throw commandError(
          "UNSUPPORTED_DIAGRAM_TYPE",
          `Mermaid diagram type "${original.split(/\s+/)[0]}" is not supported locally. Supported: graph, flowchart.`,
        );
      }
      warnings.push(`Skipped line outside a graph/flowchart block: ${truncateText(original, 160)}`);
      continue;
    }

    let line = original
      .replace(/--\s+([^|>]+?)\s+-->/g, " -->|$1| ")
      .replace(/==\s+([^|>]+?)\s+==>/g, " ==>|$1| ")
      .replace(/-\.\s+([^|>]+?)\s+\.->/g, " -.->|$1| ");

    const parts = line.split(/\s*(-->|---|-\.->|==>|~~~)\s*/);
    if (parts.length === 1) {
      const node = parseMermaidNodeToken(parts[0]);
      if (node) {
        const existing = nodes.get(node.id);
        if (!existing) nodes.set(node.id, { id: node.id, label: node.label, shape: node.shape });
        else if (node.explicit) existing.label = node.label;
      } else {
        warnings.push(`Could not parse Mermaid line: ${truncateText(original, 160)}`);
      }
      continue;
    }

    let previous = null;
    for (let index = 0; index < parts.length; index += 2) {
      let nodeSource = parts[index];
      let edgeLabel = "";
      const labelMatch = nodeSource.match(/^\|([^|]*)\|\s*([\s\S]*)$/);
      if (labelMatch) {
        edgeLabel = stripMermaidQuotes(labelMatch[1]);
        nodeSource = labelMatch[2];
      }

      const nodeToken = parseMermaidNodeToken(nodeSource);
      if (!nodeToken) {
        warnings.push(`Could not parse Mermaid node: ${truncateText(parts[index], 160)}`);
        previous = null;
        break;
      }
      const existing = nodes.get(nodeToken.id);
      if (!existing) nodes.set(nodeToken.id, { id: nodeToken.id, label: nodeToken.label, shape: nodeToken.shape });
      else if (nodeToken.explicit) existing.label = nodeToken.label;

      if (previous) {
        const arrow = parts[index - 1];
        edges.push({ from: previous, to: nodeToken.id, label: edgeLabel, arrow });
      }
      previous = nodeToken.id;
    }
  }

  if (!started) {
    throw commandError(
      "UNSUPPORTED_DIAGRAM_TYPE",
      "Only Mermaid graph/flowchart syntax is supported locally. Start the source with 'flowchart LR' or 'graph LR'.",
    );
  }

  return {
    direction: direction || "LR",
    nodes: Array.from(nodes.values()),
    edges,
    warnings,
  };
}

function layoutDiagram(nodes, edges, direction) {
  const levels = new Map();
  const incoming = new Map();
  for (const node of nodes) incoming.set(node.id, 0);
  for (const edge of edges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);

  const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id);
  for (const id of queue) levels.set(id, 0);
  let cursor = 0;
  while (cursor < queue.length) {
    const id = queue[cursor++];
    const level = levels.get(id) || 0;
    for (const edge of edges.filter((item) => item.from === id)) {
      levels.set(edge.to, Math.max(levels.get(edge.to) || 0, level + 1));
      incoming.set(edge.to, (incoming.get(edge.to) || 1) - 1);
      if ((incoming.get(edge.to) || 0) === 0) queue.push(edge.to);
    }
  }
  for (const node of nodes) if (!levels.has(node.id)) levels.set(node.id, 0);

  const byLevel = new Map();
  for (const node of nodes) {
    const level = levels.get(node.id) || 0;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(node);
  }

  const width = 180;
  const height = 80;
  const gapX = 80;
  const gapY = 60;
  let maxX = 0;
  let maxY = 0;
  for (const [level, items] of byLevel) {
    items.forEach((node, index) => {
      if (direction === "TB" || direction === "BT") {
        node.x = index * (width + gapX);
        node.y = level * (height + gapY);
      } else {
        node.x = level * (width + gapX);
        node.y = index * (height + gapY);
      }
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    });
  }

  const center = figma.viewport && figma.viewport.center ? figma.viewport.center : { x: 0, y: 0 };
  const offsetX = (Number(center.x) || 0) - maxX / 2;
  const offsetY = (Number(center.y) || 0) - maxY / 2;
  for (const node of nodes) {
    node.x += offsetX;
    node.y += offsetY;
  }
  return { width: maxX, height: maxY };
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function commandGetVariableDefs(payload) {
  const target = await resolveTarget(payload);
  const maxDepth = clampInt(payload.maxDepth, 8, 0, 30);
  const maxNodes = clampInt(payload.maxNodes, 2000, 1, 5000);
  const ctx = createBindingContext();

  const state = walkNodes(target, { maxDepth, maxNodes }, (node) => collectNodeBindings(node, ctx));
  await resolveStyleRefs(ctx);
  const variableResult = await resolveVariablesForContext(ctx);
  const styleResult = styleDefinitionsFromContext(ctx);

  return {
    mode: "plugin-api",
    node: { id: target.id, name: target.name, type: target.type },
    file: figma.root ? figma.root.name : undefined,
    editorType: figma.editorType,
    variables: variableResult.values,
    definitions: variableResult.definitions,
    styles: styleResult.styles,
    styleDefinitions: styleResult.definitions,
    nodeCount: state.count,
    truncated: state.truncated,
    warnings: [
      "Values are resolved for the consuming node and its selected modes where the Plugin API allows it.",
      "Remote variables that are not imported may only expose an alias id.",
    ],
  };
}

async function commandGetDesignContext(payload) {
  const target = await resolveTarget(payload);
  const maxDepth = clampInt(payload.maxDepth, 6, 0, 20);
  const maxNodes = clampInt(payload.maxNodes, 1500, 1, 5000);
  const includeVariables = payload.includeVariables !== false;
  const includeStyles = payload.includeStyles !== false;
  const ctx = createBindingContext();

  const state = walkNodes(target, { maxDepth, maxNodes }, (node) => collectNodeBindings(node, ctx));
  await resolveStyleRefs(ctx);
  const variableResult = await resolveVariablesForContext(ctx);
  const styleResult = styleDefinitionsFromContext(ctx);

  const styleNames = new Map();
  for (const definition of styleResult.definitions) styleNames.set(definition.id, definition);

  const summary = {
    colors: {},
    typography: {},
    spacing: {},
    radii: {},
    effects: {},
    components: {},
    textCount: 0,
    nodeCount: 0,
  };

  const root = serializeDesignNode(target, 0, maxDepth, { count: 0, limit: maxNodes, truncated: false }, {
    variableNames: includeVariables ? variableResult.names : new Map(),
    styleNames: includeStyles ? styleNames : new Map(),
    includeVariables,
    includeStyles,
    summary,
  });
  summary.nodeCount = state.count;

  const warnings = [];
  if (state.truncated) warnings.push(`Node output truncated at ${maxNodes} nodes or depth ${maxDepth}.`);
  if (payload.forceCode) warnings.push("forceCode is ignored: local structured context is not Figma's proprietary code generator.");
  if (payload.disableCodeConnect) warnings.push("Code Connect is unavailable locally, so disableCodeConnect has no effect.");
  if (payload.clientLanguages || payload.clientFrameworks) {
    warnings.push("clientLanguages/clientFrameworks are informational only in this local server.");
  }

  let screenshot;
  if (payload.excludeScreenshot !== true) {
    screenshot = await exportPngBase64(target, clampInt(payload.maxDimension, 1024, 1, 65536), 2);
    if (!screenshot) warnings.push("Screenshot was unavailable or exceeded the local size limit.");
  }

  return {
    mode: "local-structured",
    disclaimer:
      "This is a structured Plugin API approximation, not Figma's proprietary React/Tailwind/iOS code generation. Generate code from this data using your project's components and tokens.",
    file: figma.root ? figma.root.name : undefined,
    page: figma.currentPage ? figma.currentPage.name : undefined,
    editorType: figma.editorType,
    root,
    summary,
    variables: includeVariables ? variableResult.values : undefined,
    styles: includeStyles ? styleResult.styles : undefined,
    nodeCount: state.count,
    truncated: state.truncated,
    warnings,
    screenshot: screenshot
      ? { base64: screenshot.base64, mimeType: screenshot.mimeType, byteLength: screenshot.byteLength, width: screenshot.width, height: screenshot.height }
      : undefined,
  };
}

async function commandGetFigjam(payload) {
  if (figma.editorType !== "figjam") {
    throw commandError(
      "UNSUPPORTED_FILE",
      `get_figjam requires a FigJam board. The open file reports editorType "${figma.editorType || "figma"}".`,
    );
  }
  const target = await resolveTarget(payload);
  const maxDepth = clampInt(payload.maxDepth, 10, 0, 30);
  const maxNodes = clampInt(payload.maxNodes, 2000, 1, 5000);
  const state = walkNodes(target, { maxDepth, maxNodes }, () => {});
  const xmlState = { counter: 0, limit: maxNodes, truncated: false };
  const xml = `<figjam${xmlAttributes({ file: figma.root ? figma.root.name : undefined, page: figma.currentPage ? figma.currentPage.name : undefined, editorType: figma.editorType })}>${figjamTreeToXml(target, 0, maxDepth, xmlState)}</figjam>`;

  const images = [];
  const warnings = [];
  if (payload.includeImagesOfNodes !== false) {
    let totalBytes = 0;
    for (const entry of state.visited) {
      if (images.length >= 6) break;
      if (entry.node.type === "PAGE" || typeof entry.node.exportAsync !== "function") continue;
      const image = await exportPngBase64(entry.node, 512, 1);
      if (!image) {
        warnings.push(`Skipped image for ${entry.node.name} (${entry.node.id}); export was unavailable or too large.`);
        continue;
      }
      if (totalBytes + image.byteLength > 4 * 1024 * 1024) {
        warnings.push("Stopped including node images at the local 4 MB limit.");
        break;
      }
      totalBytes += image.byteLength;
      images.push({
        nodeId: entry.node.id,
        name: entry.node.name,
        base64: image.base64,
        mimeType: image.mimeType,
        byteLength: image.byteLength,
        width: image.width,
        height: image.height,
      });
    }
  }

  return {
    mode: "plugin-api",
    editorType: figma.editorType,
    file: figma.root ? figma.root.name : undefined,
    page: figma.currentPage ? figma.currentPage.name : undefined,
    xml,
    images,
    nodeCount: state.count,
    truncated: state.truncated || xmlState.truncated,
    warnings,
  };
}

async function commandDownloadAssets(payload) {
  const requestedIds = Array.isArray(payload.nodeIds) ? payload.nodeIds.slice(0, 20) : [];
  const targets = [];
  if (requestedIds.length > 0) {
    for (const id of requestedIds) {
      const node = await findNodeById(id);
      if (!node) throw commandError("NODE_NOT_FOUND", `Node not found for id "${id}"`);
      targets.push(node);
    }
  } else {
    targets.push(await resolveTarget(payload));
  }

  const assets = [];
  const rawImages = [];
  const svgAssets = [];
  const warnings = [];
  const imageHashes = new Set();
  let totalBytes = 0;
  let truncated = false;

  const formatFor = (target) => {
    if (payload.defaultFormat) return String(payload.defaultFormat).toUpperCase();
    if (Array.isArray(target.exportSettings) && target.exportSettings.length > 0) {
      const configured = target.exportSettings[0].format;
      if (configured) return String(configured).toUpperCase();
    }
    return "PNG";
  };

  const scaleFor = (target) => {
    if (payload.defaultScale !== undefined) return Number(payload.defaultScale);
    if (Array.isArray(target.exportSettings) && target.exportSettings.length > 0) {
      const constraint = target.exportSettings[0].constraint;
      if (constraint && constraint.type === "SCALE") return Number(constraint.value);
    }
    return 1;
  };

  for (const target of targets) {
    const format = formatFor(target);
    let scale = scaleFor(target);
    if (payload.maxDimension && (format === "PNG" || format === "JPG")) {
      const width = Number(target.width) || 0;
      const height = Number(target.height) || 0;
      if (width > 0 && height > 0) scale = Math.min(scale, Number(payload.maxDimension) / Math.max(width, height));
    }
    scale = Math.max(0.01, Math.min(4, scale));

    try {
      const settings =
        format === "PNG" || format === "JPG"
          ? { format, constraint: { type: "SCALE", value: scale } }
          : { format };
      const exported = await target.exportAsync(settings);
      const bytes = typeof exported === "string" ? utf8ToBytes(exported) : exported;
      if (bytes.byteLength > MAX_EXPORT_BYTES) {
        warnings.push(`Skipped export for ${target.name} (${target.id}); ${bytes.byteLength} bytes exceeds the local limit.`);
        truncated = true;
        continue;
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > 24 * 1024 * 1024) {
        warnings.push("Stopped exporting at the local 24 MB limit.");
        truncated = true;
        break;
      }
      const mimeType =
        format === "PNG" ? "image/png" : format === "JPG" ? "image/jpeg" : format === "SVG" ? "image/svg+xml" : format === "PDF" ? "application/pdf" : "application/octet-stream";
      assets.push({
        nodeId: target.id,
        name: target.name,
        kind: "export",
        format: format.toLowerCase(),
        scale: format === "PNG" || format === "JPG" ? scale : undefined,
        mimeType,
        base64: bytesToBase64(bytes),
        byteLength: bytes.byteLength,
      });
    } catch (error) {
      warnings.push(`Could not export ${target.name} (${target.id}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (payload.includeRawImages !== false) {
    const scan = walkNodes(targets.length === 1 ? targets[0] : figma.currentPage, { maxDepth: 30, maxNodes: 10000 }, () => {});
    for (const entry of scan.visited) {
      if (rawImages.length >= 20) {
        truncated = true;
        break;
      }
      const node = entry.node;
      for (const collection of ["fills", "strokes"]) {
        const values = node[collection];
        if (!Array.isArray(values)) continue;
        for (const paint of values) {
          if (!paint || paint.type !== "IMAGE" || !paint.imageHash || imageHashes.has(paint.imageHash)) continue;
          imageHashes.add(paint.imageHash);
          if (rawImages.length >= 20) {
            truncated = true;
            break;
          }
          try {
            const image = typeof figma.getImageByHash === "function" ? figma.getImageByHash(paint.imageHash) : null;
            if (!image) continue;
            const bytes = await image.getBytesAsync();
            if (bytes.byteLength > MAX_EXPORT_BYTES) {
              warnings.push(`Skipped source image ${paint.imageHash}; exceeds the local per-asset limit.`);
              continue;
            }
            if (totalBytes + bytes.byteLength > 24 * 1024 * 1024) {
              warnings.push("Stopped including source images at the local 24 MB limit.");
              truncated = true;
              break;
            }
            totalBytes += bytes.byteLength;
            const format = imageFormatFromBytes(bytes);
            rawImages.push({
              hash: paint.imageHash,
              format,
              mimeType: format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : format === "gif" ? "image/gif" : format === "webp" ? "image/webp" : "application/octet-stream",
              base64: bytesToBase64(bytes),
              byteLength: bytes.byteLength,
              usedByNodeIds: [node.id],
            });
          } catch (error) {
            warnings.push(`Could not read source image ${paint.imageHash}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }

  if (payload.includeSvgAssets !== false) {
    const vectorTypes = { VECTOR: true, BOOLEAN_OPERATION: true, STAR: true, POLYGON: true, LINE: true };
    const scan = walkNodes(targets.length === 1 ? targets[0] : figma.currentPage, { maxDepth: 30, maxNodes: 10000 }, () => {});
    for (const entry of scan.visited) {
      if (svgAssets.length >= 20) {
        truncated = true;
        break;
      }
      if (!vectorTypes[entry.node.type] || typeof entry.node.exportAsync !== "function") continue;
      try {
        const exported = await entry.node.exportAsync({ format: "SVG" });
        const bytes = typeof exported === "string" ? utf8ToBytes(exported) : exported;
        if (bytes.byteLength > MAX_EXPORT_BYTES) {
          warnings.push(`Skipped SVG ${entry.node.name}; exceeds the local per-asset limit.`);
          continue;
        }
        if (totalBytes + bytes.byteLength > 24 * 1024 * 1024) {
          warnings.push("Stopped including SVG assets at the local 24 MB limit.");
          truncated = true;
          break;
        }
        totalBytes += bytes.byteLength;
        svgAssets.push({
          nodeId: entry.node.id,
          name: entry.node.name,
          format: "svg",
          mimeType: "image/svg+xml",
          base64: bytesToBase64(bytes),
          byteLength: bytes.byteLength,
        });
      } catch (error) {
        warnings.push(`Could not export SVG ${entry.node.name} (${entry.node.id}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return {
    mode: "local-files",
    file: figma.root ? figma.root.name : undefined,
    assets,
    rawImages,
    svgAssets,
    rawImagesTruncated: rawImages.length >= 20,
    truncated,
    warnings,
  };
}

function createImageContainer() {
  if (figma.editorType === "figjam" && typeof figma.createRectangle === "function") return figma.createRectangle();
  if (typeof figma.createFrame === "function") return figma.createFrame();
  if (typeof figma.createRectangle === "function") return figma.createRectangle();
  throw commandError("UNSUPPORTED_FILE", "This file type cannot create a container for uploaded images.");
}

async function commandUploadAssets(payload) {
  const assets = Array.isArray(payload.assets) ? payload.assets.slice(0, 60) : [];
  if (assets.length === 0) throw commandError("INVALID_ARGUMENT", "No assets were provided.");
  const nodeIds = Array.isArray(payload.nodeIds) ? payload.nodeIds : [];
  if (nodeIds.length > 0 && nodeIds.length !== assets.length) {
    throw commandError("INVALID_ASSET_TARGETS", "nodeIds must contain exactly one target per asset, in order.");
  }

  const parent = payload.parentId ? await findNodeById(payload.parentId) : figma.currentPage;
  if (!parent) throw commandError("NODE_NOT_FOUND", `Parent node not found for id "${payload.parentId}"`);
  if (typeof parent.appendChild !== "function") {
    throw commandError("UNSUPPORTED_NODE", "The requested parent cannot contain layers.");
  }

  const center = figma.viewport && figma.viewport.center ? figma.viewport.center : { x: 0, y: 0 };
  const baseX = Number.isFinite(Number(payload.x)) ? Number(payload.x) : (Number(center.x) || 0) - 90;
  const baseY = Number.isFinite(Number(payload.y)) ? Number(payload.y) : (Number(center.y) || 0) - 60;
  let cursorX = baseX;
  const scaleMode = payload.scaleMode || "FILL";
  const results = [];
  const warnings = [];

  for (let index = 0; index < assets.length; index++) {
    const asset = assets[index] || {};
    const name = String(asset.name || `asset-${index + 1}`);
    const mimeType = String(asset.mimeType || "");
    if (!asset.base64) throw commandError("INVALID_ASSET", `Asset ${index} is missing base64 data.`);
    const bytes = base64ToBytes(asset.base64);

    if (mimeType === "image/svg+xml" || name.toLowerCase().endsWith(".svg")) {
      if (typeof figma.createNodeFromSvg !== "function") {
        throw commandError("UNSUPPORTED_FILE", "This Figma build does not support createNodeFromSvg().");
      }
      const svg = bytesToUtf8(bytes);
      const node = figma.createNodeFromSvg(svg);
      node.name = name;
      parent.appendChild(node);
      node.x = cursorX;
      node.y = baseY;
      cursorX += (Number(node.width) || 100) + 24;
      results.push({ nodeId: node.id, name, kind: "svg", width: node.width, height: node.height });
      continue;
    }

    if (typeof figma.createImage !== "function") {
      throw commandError("UNSUPPORTED_FILE", "This Figma build does not support figma.createImage().");
    }
    const image = figma.createImage(bytes);
    const targetId = nodeIds[index];
    if (targetId) {
      const target = await findNodeById(targetId);
      if (!target) throw commandError("NODE_NOT_FOUND", `Target node not found for id "${targetId}"`);
      if (!("fills" in target)) throw commandError("UNSUPPORTED_NODE", `Node "${targetId}" does not support fills.`);
      const existing = Array.isArray(target.fills) ? target.fills : [];
      target.fills = existing.concat([{ type: "IMAGE", imageHash: image.hash, scaleMode }]);
      results.push({ nodeId: target.id, name, kind: "fill", imageHash: image.hash });
      continue;
    }

    const container = createImageContainer();
    container.name = name;
    const size = typeof image.getSizeAsync === "function" ? await image.getSizeAsync() : null;
    const width = size && Number(size.width) > 0 ? Number(size.width) : 100;
    const height = size && Number(size.height) > 0 ? Number(size.height) : 100;
    if (typeof container.resize === "function") container.resize(width, height);
    container.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode }];
    parent.appendChild(container);
    container.x = cursorX;
    container.y = baseY;
    cursorX += width + 24;
    results.push({ nodeId: container.id, name, kind: "frame", imageHash: image.hash, width, height });
  }

  return {
    mode: "plugin-api",
    file: figma.root ? figma.root.name : undefined,
    assets: results,
    warnings,
  };
}

async function commandGetMotionContext(payload) {
  const target = await resolveTarget(payload);
  const recursive = payload.recursive === true;
  const maxDepth = clampInt(payload.maxDepth, 10, 0, 20);
  const maxNodes = clampInt(payload.maxNodes, 500, 1, 2000);
  const nodes = [];
  const warnings = [];

  if (!recursive) {
    nodes.push(collectMotion(target, ""));
  } else {
    const state = walkNodes(target, { maxDepth, maxNodes }, (node, _depth, path) => {
      const motion = collectMotion(node, path);
      if (motion.hasAnimation || node.id === target.id) nodes.push(motion);
    });
    if (state.truncated) warnings.push(`Motion scan truncated at ${maxNodes} nodes or depth ${maxDepth}.`);
  }

  if (typeof figma.motion === "undefined") {
    warnings.push("figma.motion is not available in this build; only stored animation/keyframe data was read.");
  }

  return {
    mode: "plugin-api-partial",
    node: { id: target.id, name: target.name, type: target.type },
    recursive,
    nodes,
    warnings,
    limitations: [
      "Figma animation styles are returned as metadata; they cannot be reproduced exactly in CSS or Motion.",
      "Only supported keyframe fields receive CSS/Motion snippets.",
      "Spring easings are approximated with a cubic-bezier curve in generated CSS.",
    ],
  };
}

async function commandGetLibraries(payload) {
  const includeVariables = payload.includeVariables === true;
  const maxCollections = clampInt(payload.maxCollections, 50, 1, 200);
  const warnings = [];
  const limitations = [
    "The Plugin API cannot enumerate subscribed component/style libraries or available Community/organization libraries.",
    "Only variable collections from libraries already enabled for this file are visible.",
  ];

  const variableLibraries = [];
  try {
    if (figma.teamLibrary && typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync === "function") {
      const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      const grouped = new Map();
      for (const collection of collections.slice(0, maxCollections)) {
        const libraryName = collection.libraryName || "(unknown library)";
        if (!grouped.has(libraryName)) grouped.set(libraryName, []);
        const entry = { name: collection.name, key: collection.key };
        if (includeVariables) {
          try {
            const variables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key);
            entry.variables = variables.slice(0, 500).map((variable) => ({
              name: variable.name,
              key: variable.key,
              resolvedType: variable.resolvedType,
            }));
            if (variables.length > 500) entry.truncated = true;
          } catch (error) {
            entry.error = error instanceof Error ? error.message : String(error);
          }
        }
        grouped.get(libraryName).push(entry);
      }
      for (const [libraryName, entries] of grouped) {
        variableLibraries.push({ libraryName, collections: entries });
      }
    } else {
      warnings.push("figma.teamLibrary variable collection APIs are unavailable in this build.");
    }
  } catch (error) {
    warnings.push(`Could not read library variable collections: ${error instanceof Error ? error.message : String(error)}`);
  }

  const localVariableCollections = [];
  try {
    let collections = [];
    if (figma.variables && typeof figma.variables.getLocalVariableCollectionsAsync === "function") {
      collections = await figma.variables.getLocalVariableCollectionsAsync();
    } else if (figma.variables && typeof figma.variables.getLocalVariableCollections === "function") {
      collections = figma.variables.getLocalVariableCollections();
    }
    for (const collection of collections.slice(0, maxCollections)) {
      localVariableCollections.push({
        id: collection.id,
        name: collection.name,
        key: collection.key,
        modes: jsonSafe(collection.modes),
        defaultModeId: collection.defaultModeId,
        variableCount: Array.isArray(collection.variableIds) ? collection.variableIds.length : undefined,
        remote: collection.remote,
      });
    }
  } catch (error) {
    warnings.push(`Could not read local variable collections: ${error instanceof Error ? error.message : String(error)}`);
  }

  const localAssets = { paintStyles: 0, textStyles: 0, effectStyles: 0, gridStyles: 0, components: 0, componentSets: 0 };
  const localStyleNames = { paint: [], text: [], effect: [], grid: [] };
  try {
    if (typeof figma.getLocalPaintStylesAsync === "function") {
      const styles = await figma.getLocalPaintStylesAsync();
      localAssets.paintStyles = styles.length;
      localStyleNames.paint = styles.slice(0, 50).map((style) => style.name);
    }
    if (typeof figma.getLocalTextStylesAsync === "function") {
      const styles = await figma.getLocalTextStylesAsync();
      localAssets.textStyles = styles.length;
      localStyleNames.text = styles.slice(0, 50).map((style) => style.name);
    }
    if (typeof figma.getLocalEffectStylesAsync === "function") {
      const styles = await figma.getLocalEffectStylesAsync();
      localAssets.effectStyles = styles.length;
      localStyleNames.effect = styles.slice(0, 50).map((style) => style.name);
    }
    if (typeof figma.getLocalGridStylesAsync === "function") {
      const styles = await figma.getLocalGridStylesAsync();
      localAssets.gridStyles = styles.length;
      localStyleNames.grid = styles.slice(0, 50).map((style) => style.name);
    }
  } catch (error) {
    warnings.push(`Could not read local styles: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const components = typeof figma.currentPage.findAllWithCriteria === "function"
      ? figma.currentPage.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] })
      : figma.currentPage.findAll((node) => node.type === "COMPONENT" || node.type === "COMPONENT_SET");
    for (const node of components) {
      if (node.type === "COMPONENT_SET") localAssets.componentSets++;
      else localAssets.components++;
    }
  } catch (error) {
    warnings.push(`Could not read local components: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    mode: "plugin-api-partial",
    file: figma.root ? figma.root.name : undefined,
    editorType: figma.editorType,
    variableLibraries,
    localVariableCollections,
    localAssets,
    localStyleNames,
    limitations,
    warnings,
  };
}

function scoreMatch(name, query) {
  const haystack = String(name || "").toLowerCase();
  const needle = String(query || "").toLowerCase().trim();
  if (!needle) return null;
  if (haystack === needle) return 0;
  if (haystack.startsWith(needle)) return 1;
  if (haystack.split(/[\s/_.-]+/).some((part) => part === needle)) return 2;
  const index = haystack.indexOf(needle);
  if (index >= 0) return 3 + index / Math.max(1, haystack.length);
  return null;
}

async function commandSearchDesignSystem(payload) {
  const queries = Array.isArray(payload.queries) ? payload.queries.slice(0, 20) : [];
  if (queries.length === 0) throw commandError("INVALID_ARGUMENT", "At least one {entity, query} entry is required.");
  const limit = clampInt(payload.limit, 25, 1, 100);
  const includeLibraryVariables = payload.includeLibraryVariables !== false;
  const candidates = [];
  const warnings = [];
  const limitations = [
    "Library components and library styles cannot be listed or searched through the Plugin API.",
    "Library variables are limited to collections already enabled for this file.",
    "Ranking uses local exact/prefix/word/substring scoring, not Figma's search service.",
  ];

  try {
    const components = typeof figma.currentPage.findAllWithCriteria === "function"
      ? figma.currentPage.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] })
      : figma.currentPage.findAll((node) => node.type === "COMPONENT" || node.type === "COMPONENT_SET");
    for (const node of components.slice(0, 2000)) {
      const componentSet = node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET" ? node.parent : null;
      candidates.push({
        kind: "component",
        entity: "component",
        id: node.id,
        name: node.name,
        key: node.key,
        componentKey: node.type === "COMPONENT" ? node.key : undefined,
        componentSetKey: componentSet ? componentSet.key : node.type === "COMPONENT_SET" ? node.key : undefined,
      });
    }
  } catch (error) {
    warnings.push(`Could not read local components: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    let variables = [];
    if (figma.variables && typeof figma.variables.getLocalVariablesAsync === "function") {
      variables = await figma.variables.getLocalVariablesAsync();
    } else if (figma.variables && typeof figma.variables.getLocalVariables === "function") {
      variables = figma.variables.getLocalVariables();
    }
    let collections = [];
    try {
      if (figma.variables && typeof figma.variables.getLocalVariableCollectionsAsync === "function") {
        collections = await figma.variables.getLocalVariableCollectionsAsync();
      } else if (figma.variables && typeof figma.variables.getLocalVariableCollections === "function") {
        collections = figma.variables.getLocalVariableCollections();
      }
    } catch {}
    const collectionNames = new Map(collections.map((collection) => [collection.id, collection.name]));
    for (const variable of variables.slice(0, 3000)) {
      candidates.push({
        kind: "variable",
        entity: "variable",
        id: variable.id,
        name: variable.name,
        key: variable.key,
        resolvedType: variable.resolvedType,
        collection: collectionNames.get(variable.variableCollectionId) || variable.variableCollectionId,
      });
    }

    if (includeLibraryVariables && figma.teamLibrary && typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync === "function") {
      const libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      for (const collection of libraryCollections.slice(0, 30)) {
        try {
          const libraryVariables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key);
          for (const variable of libraryVariables.slice(0, 1000)) {
            candidates.push({
              kind: "variable",
              entity: "variable",
              name: variable.name,
              key: variable.key,
              resolvedType: variable.resolvedType,
              collection: collection.name,
              library: collection.libraryName,
            });
          }
        } catch (error) {
          warnings.push(`Could not search library collection ${collection.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } catch (error) {
    warnings.push(`Could not read variables: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const styleGroups = [
      ["PAINT", "getLocalPaintStylesAsync"],
      ["TEXT", "getLocalTextStylesAsync"],
      ["EFFECT", "getLocalEffectStylesAsync"],
      ["GRID", "getLocalGridStylesAsync"],
    ];
    for (const [styleType, method] of styleGroups) {
      if (typeof figma[method] !== "function") continue;
      const styles = await figma[method]();
      for (const style of styles.slice(0, 1000)) {
        candidates.push({
          kind: "style",
          entity: "style",
          id: style.id,
          name: style.name,
          key: style.key,
          styleType,
        });
      }
    }
  } catch (error) {
    warnings.push(`Could not read local styles: ${error instanceof Error ? error.message : String(error)}`);
  }

  const results = [];
  for (const query of queries) {
    const matches = [];
    for (const candidate of candidates) {
      if (candidate.entity !== query.entity) continue;
      const score = scoreMatch(candidate.name, query.query);
      if (score === null) continue;
      matches.push({ score, candidate });
    }
    matches.sort((a, b) => a.score - b.score || String(a.candidate.name).localeCompare(String(b.candidate.name)));
    results.push({
      entity: query.entity,
      query: query.query,
      truncated: matches.length > limit,
      results: matches.slice(0, limit).map((match) => {
        const { score, candidate } = match;
        void score;
        return candidate;
      }),
    });
  }

  return {
    mode: "plugin-api-partial",
    scope: "local-assets-and-enabled-library-variables",
    results,
    candidateCount: candidates.length,
    limitations,
    warnings,
  };
}

async function commandListShaders(payload) {
  void payload;
  const catalog = await shaderCatalog();
  return {
    mode: "plugin-api-available-shaders",
    file: figma.root ? figma.root.name : undefined,
    shaders: catalog.shaders.slice(0, 200).map((shader) => ({
      id: shader.id,
      name: shader.name,
      type: shader.type,
      imported: shader.imported,
      propertyDefinitions: jsonSafe(shader.propertyDefinitions),
    })),
    truncated: catalog.shaders.length > 200,
    limitations: [
      "This is the set of shaders available to the open file, not the full account library.",
      "Shader source, owner, description, and version history are not exposed by the Plugin API.",
    ],
  };
}

async function commandGetShader(payload) {
  const catalog = await shaderCatalog();
  const shader = catalog.map.get(String(payload.id || ""));
  if (!shader) throw commandError("SHADER_NOT_FOUND", `No available shader matches id "${payload.id}".`);
  return {
    mode: "plugin-api-metadata",
    id: shader.id,
    name: shader.name,
    type: shader.type,
    imported: shader.imported,
    propertyDefinitions: jsonSafe(shader.propertyDefinitions),
    sourceAvailable: false,
    limitations: [
      "The Figma Plugin API does not expose shader source/GLSL, owner, description, or version history.",
    ],
  };
}

async function commandListFileShaders(payload) {
  const allPages = payload.allPages === true;
  const maxNodes = clampInt(payload.maxNodes, 10000, 1, 50000);
  let warnings = [];
  let root = figma.currentPage;
  if (allPages) {
    try {
      if (typeof figma.loadAllPagesAsync === "function") await figma.loadAllPagesAsync();
      root = figma.root;
    } catch (error) {
      warnings.push(`Could not load all pages; scanned the current page only: ${error instanceof Error ? error.message : String(error)}`);
      root = figma.currentPage;
    }
  }

  const catalog = typeof figma.listAvailableShaders === "function" ? await shaderCatalog().catch(() => null) : null;
  if (!catalog) warnings.push("figma.listAvailableShaders() is unavailable; shader names/types may be missing.");

  const shaders = new Map();
  const state = walkNodes(root, { maxDepth: 30, maxNodes }, (node) => {
    const usages = shaderUsageForNode(node);
    for (const usage of usages) {
      let entry = shaders.get(usage.shaderId);
      if (!entry) {
        const shader = catalog ? catalog.map.get(usage.shaderId) : null;
        entry = {
          id: usage.shaderId,
          name: shader ? shader.name : undefined,
          type: shader ? shader.type : usage.collection === "effects" ? "effect" : "fill",
          imported: shader ? shader.imported : undefined,
          propertyDefinitions: shader ? jsonSafe(shader.propertyDefinitions) : undefined,
          usedBy: [],
        };
        shaders.set(usage.shaderId, entry);
      }
      if (entry.usedBy.length < 100) {
        entry.usedBy.push({
          nodeId: usage.nodeId,
          nodeName: usage.nodeName,
          collection: usage.collection,
          index: usage.index,
          properties: usage.properties,
          propertyMetadata: usage.propertyMetadata,
        });
      }
    }
  });

  const list = Array.from(shaders.values()).slice(0, 100);
  return {
    mode: "plugin-api-partial",
    scope: allPages ? "all-pages" : "current-page",
    file: figma.root ? figma.root.name : undefined,
    shaders: list,
    nodeCount: state.count,
    truncated: state.truncated || shaders.size > 100,
    warnings,
    limitations: ["Shader source files and version manifests are not exposed by the Figma Plugin API."],
  };
}

async function commandExportVideo(payload) {
  const nodeId = payload.nodeId ? String(payload.nodeId) : "";
  if (!nodeId) throw commandError("INVALID_ARGUMENT", "export_video requires a top-level frame nodeId.");
  const target = await findNodeById(nodeId);
  if (!target) throw commandError("NODE_NOT_FOUND", `Node not found for id "${nodeId}"`);

  const supportedFps = [12, 24, 30, 60];
  const requestedFps = clampInt(payload.fps, 30, 5, 60);
  const fps = supportedFps.reduce(
    (best, candidate) => (Math.abs(candidate - requestedFps) < Math.abs(best - requestedFps) ? candidate : best),
    supportedFps[0],
  );
  const quality = String(payload.quality || "high").toUpperCase();
  if (["LOW", "MEDIUM", "HIGH"].indexOf(quality) < 0) {
    throw commandError("INVALID_ARGUMENT", `quality must be low, medium, or high (received "${payload.quality}").`);
  }

  const settings = { format: "MP4", fps, quality };
  const constraint = payload.constraint;
  if (constraint && typeof constraint === "object") {
    if (constraint.type === "SCALE") {
      const allowed = [0.5, 0.75, 1, 1.5, 2, 3, 4];
      const value = Number(constraint.value);
      if (allowed.indexOf(value) < 0) {
        throw commandError("INVALID_ARGUMENT", "SCALE constraint must be one of 0.5, 0.75, 1, 1.5, 2, 3, 4.");
      }
      settings.constraint = { type: "SCALE", value };
    } else if (constraint.type === "WIDTH" || constraint.type === "HEIGHT") {
      const value = Math.min(4096, Math.max(1, Math.round(Number(constraint.value) || 0)));
      if (!value) throw commandError("INVALID_ARGUMENT", "WIDTH/HEIGHT constraint needs a positive value.");
      settings.constraint = { type: constraint.type, value };
    } else {
      throw commandError("INVALID_ARGUMENT", "constraint.type must be SCALE, WIDTH, or HEIGHT.");
    }
  }

  let bytes;
  try {
    bytes = await target.exportAsync(settings);
  } catch (error) {
    throw commandError(
      "EXPORT_FAILED",
      `Could not export ${target.name} (${target.id}) as MP4. The node must be a top-level frame or slide whose content is animated. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!bytes || typeof bytes === "string") {
    throw commandError("EXPORT_FAILED", "The Figma build did not return MP4 bytes for this node.");
  }
  if (bytes.byteLength > 100 * 1024 * 1024) {
    throw commandError("ASSET_TOO_LARGE", "The exported video exceeds the local 100 MB limit.");
  }

  const warnings = [];
  if (fps !== requestedFps) {
    warnings.push(`Requested ${requestedFps} fps; the Plugin API supports 12, 24, 30, or 60 fps, so ${fps} fps was used.`);
  }

  return {
    mode: "local-file",
    id: target.id,
    name: target.name,
    format: "MP4",
    mimeType: "video/mp4",
    fps,
    quality: quality.toLowerCase(),
    constraint: settings.constraint,
    base64: bytesToBase64(bytes),
    byteLength: bytes.byteLength,
    width: safeValue("width" in target ? target.width : undefined),
    height: safeValue("height" in target ? target.height : undefined),
    warnings,
    limitations: [
      "The official server renders server-side and returns a temporary URL. This local server exports through the Plugin API and writes a local file.",
      "MP4 export requires a top-level frame (or slide) with animated content.",
    ],
  };
}

async function commandGenerateDiagram(payload) {
  if (figma.editorType !== "figjam") {
    throw commandError("UNSUPPORTED_FILE", "generate_diagram requires a FigJam board.");
  }
  if (typeof figma.createShapeWithText !== "function" || typeof figma.createConnector !== "function") {
    throw commandError("UNSUPPORTED_FILE", "This Figma build does not expose FigJam shape/connector creation APIs.");
  }
  const maxNodes = clampInt(payload.maxNodes, 100, 1, 200);
  const parsed = parseMermaidFlowchart(payload.mermaidSyntax);
  const direction = payload.direction || parsed.direction;
  const nodes = parsed.nodes.slice(0, maxNodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = parsed.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)).slice(0, 400);
  const warnings = parsed.warnings.slice();
  if (parsed.nodes.length > maxNodes) warnings.push(`Diagram truncated to ${maxNodes} shapes.`);

  layoutDiagram(nodes, edges, direction);

  try {
    await ensureFontLoaded({ family: "Inter", style: "Regular" });
  } catch {}

  const created = new Map();
  for (const node of nodes) {
    const shape = figma.createShapeWithText();
    shape.name = node.label || node.id;
    if (node.shape) shape.shapeType = node.shape;
    if (typeof shape.resize === "function") shape.resize(180, 80);
    figma.currentPage.appendChild(shape);
    shape.x = node.x;
    shape.y = node.y;
    if (shape.text && node.label) {
      try { shape.text.characters = node.label; } catch (error) {
        warnings.push(`Could not set text for ${node.label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    created.set(node.id, shape);
  }

  const createdEdges = [];
  for (const edge of edges) {
    const connector = figma.createConnector();
    if (edge.arrow === "-.->") connector.connectorLineType = "CURVED";
    else connector.connectorLineType = "ELBOWED";
    connector.connectorStart = { endpointNodeId: created.get(edge.from).id, magnet: "AUTO" };
    connector.connectorEnd = { endpointNodeId: created.get(edge.to).id, magnet: "AUTO" };
    figma.currentPage.appendChild(connector);
    if (edge.label && connector.text) {
      try { connector.text.characters = edge.label; } catch (error) {
        warnings.push(`Could not set connector label: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    createdEdges.push({ from: created.get(edge.from).id, to: created.get(edge.to).id, label: edge.label || undefined });
  }

  return {
    mode: "plugin-api-partial",
    name: payload.name || "Diagram",
    direction,
    nodes: nodes.map((node) => ({ id: created.get(node.id).id, sourceId: node.id, label: node.label, shape: node.shape })),
    edges: createdEdges,
    warnings,
    limitations: ["Only Mermaid graph/flowchart syntax is supported locally; sequence, state, gantt, and ERD diagrams are not."],
  };
}

async function execute(command) {
  const payload = command.payload || {};

  if (command.type === "use_figma") {
    const code = String(payload.code || "");
    if (!code.trim()) {
      throw new Error("No code provided for execution");
    }
    // Run natively in the plugin sandbox with direct figma.* access.
    const runner = new Function("figma", "ensureFontLoaded",
      `return (async () => { ${code} })()`);
    return await runner(figma, ensureFontLoaded);
  }

  if (command.type === "get_node_tree") {
    const target = await resolveTarget(payload);
    const maxDepth = clampInt(payload.maxDepth, 10, 0, 30);
    const maxNodes = clampInt(payload.maxNodes, 5000, 1, 20000);
    if (String(payload.format || "json").toLowerCase() === "xml") {
      const state = { counter: 0, limit: maxNodes, truncated: false };
      const xml = nodeTreeToXml(target, 0, maxDepth, state);
      if (state.truncated) {
        return `${xml}\n<!-- truncated at ${maxNodes} nodes -->`;
      }
      return xml;
    }
    return serializeNode(target, 0, maxDepth, newState(maxNodes));
  }

  if (command.type === "export_node") {
    let target = null;
    // An explicit id/name that does not resolve fails closed — it must never
    // silently fall back to exporting the whole page.
    if (payload.nodeId) {
      target = await findNodeById(payload.nodeId);
      if (!target) throw commandError("NODE_NOT_FOUND", `Node not found for id "${payload.nodeId}"`);
    } else if (payload.name) {
      target = findNodeByName(payload.name);
      if (!target) throw commandError("NODE_NOT_FOUND", `Node not found for name "${payload.name}"`);
    } else if (figma.currentPage.selection.length > 0) {
      target = figma.currentPage.selection[0];
    } else {
      target = figma.currentPage;
    }
    const format = String(payload.format || "PNG").toUpperCase();
    let scale = Number(payload.scale || 2);
    if (payload.maxDimension) {
      const width = Number(target.width) || 0;
      const height = Number(target.height) || 0;
      if (width > 0 && height > 0) scale = Math.min(scale, Number(payload.maxDimension) / Math.max(width, height));
    }
    scale = Math.max(0.01, Math.min(4, scale));
    const settings = { format, constraint: { type: "SCALE", value: scale } };
    if (payload.contentsOnly === true) settings.contentsOnly = true;
    const bytes = await target.exportAsync(settings);
    const base64 = bytesToBase64(bytes);
    return {
      id: target.id,
      name: target.name,
      format,
      base64,
      byteLength: bytes.byteLength,
      width: Math.round((Number(target.width) || 0) * scale),
      height: Math.round((Number(target.height) || 0) * scale),
    };
  }

  if (command.type === "get_variable_defs") return commandGetVariableDefs(payload);
  if (command.type === "get_design_context") return commandGetDesignContext(payload);
  if (command.type === "get_figjam") return commandGetFigjam(payload);
  if (command.type === "download_assets") return commandDownloadAssets(payload);
  if (command.type === "upload_assets") return commandUploadAssets(payload);
  if (command.type === "get_motion_context") return commandGetMotionContext(payload);
  if (command.type === "get_libraries") return commandGetLibraries(payload);
  if (command.type === "search_design_system") return commandSearchDesignSystem(payload);
  if (command.type === "list_shaders") return commandListShaders(payload);
  if (command.type === "get_shader") return commandGetShader(payload);
  if (command.type === "list_file_shaders") return commandListFileShaders(payload);
  if (command.type === "generate_diagram") return commandGenerateDiagram(payload);
  if (command.type === "export_video") return commandExportVideo(payload);

  throw commandError("UNKNOWN_COMMAND", "Unknown command type: " + command.type);
}
