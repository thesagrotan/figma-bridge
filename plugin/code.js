figma.showUI(__html__, { width: 40, height: 40 });

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

// Sync persistent settings from clientStorage to UI on launch
(async () => {
  try {
    const savedPort = await figma.clientStorage.getAsync("figma_mcp_bridge_port");
    const savedToken = await figma.clientStorage.getAsync("figma_mcp_bridge_token");
    if (savedPort || savedToken) {
      figma.ui.postMessage({ type: "init_storage", port: savedPort, token: savedToken });
    }
  } catch {}
})();

figma.ui.onmessage = async (message) => {
  if (message.type === "set_title") {
    try { figma.ui.title = message.title; } catch {}
    return;
  }

  if (message.type === "save_storage") {
    try {
      if (message.port) await figma.clientStorage.setAsync("figma_mcp_bridge_port", String(message.port));
      if (message.token) await figma.clientStorage.setAsync("figma_mcp_bridge_token", String(message.token));
    } catch {}
    return;
  }

  if (message.type !== "execute") return;

  try {
    const result = await execute(message.command);
    figma.ui.postMessage({ type: "result", id: message.command.id, command: message.command, result: { ok: true, result } });
  } catch (error) {
    figma.ui.postMessage({
      type: "result",
      id: message.command.id,
      command: message.command,
      result: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
  }
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Figma represents MIXED values and unreadable props with symbols that do not
// survive JSON. Collapse anything non-serializable to undefined.
function safeValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "symbol") return undefined;
  return value;
}

function resolveTarget(payload) {
  if (payload.nodeId) return figma.getNodeById(String(payload.nodeId));
  if (payload.name) return figma.currentPage.findOne((n) => n.name === String(payload.name));
  if (figma.currentPage.selection.length > 0) return figma.currentPage.selection[0];
  return figma.currentPage;
}

// Serialize a node subtree with a hard node budget so a large page cannot
// produce a multi-megabyte payload.
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
    characters: safeValue("characters" in n ? n.characters : undefined),
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
    const target = resolveTarget(payload);
    if (!target) throw new Error("Target node not found");
    const maxDepth = Number(payload.maxDepth || 10);
    return serializeNode(target, 0, maxDepth, newState(5000));
  }

  if (command.type === "export_node") {
    let target = null;
    // An explicit id/name that does not resolve fails closed — it must never
    // silently fall back to exporting the whole page.
    if (payload.nodeId) {
      target = figma.getNodeById(String(payload.nodeId));
      if (!target) throw new Error(`Node not found for id "${payload.nodeId}"`);
    } else if (payload.name) {
      target = figma.currentPage.findOne(n => n.name === String(payload.name));
      if (!target) throw new Error(`Node not found for name "${payload.name}"`);
    } else if (figma.currentPage.selection.length > 0) {
      target = figma.currentPage.selection[0];
    } else {
      target = figma.currentPage;
    }
    const format = (payload.format || "PNG").toUpperCase();
    const bytes = await target.exportAsync({
      format,
      constraint: { type: "SCALE", value: Number(payload.scale || 2) },
    });
    const base64 = figma.base64Encode(bytes);
    return { id: target.id, name: target.name, format, base64, byteLength: bytes.byteLength };
  }

  throw new Error("Unknown command type: " + command.type);
}
