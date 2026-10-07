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

async function execute(command) {
  const payload = command.payload || {};

  if (command.type === "use_figma" || command.type === "eval") {
    const code = String(payload.code || payload.script || "");
    if (!code.trim()) {
      throw new Error("No code provided for execution");
    }
    // Run natively in the plugin sandbox with direct figma.* access — no IPC proxy needed.
    const runner = new Function("figma", "ensureFontLoaded",
      `return (async () => { ${code} })()`);
    return await runner(figma, ensureFontLoaded);
  }

  if (command.type === "get_node_tree" || command.type === "inspect") {
    let target = null;
    if (payload.nodeId) target = figma.getNodeById(String(payload.nodeId));
    else if (payload.name) target = figma.currentPage.findOne(n => n.name === String(payload.name));
    else target = figma.currentPage;
    if (!target) throw new Error("Target node not found");

    const maxDepth = Number(payload.maxDepth || 10);
    function serializeNode(n, depth = 0) {
      const info = {
        id: n.id,
        name: n.name,
        type: n.type,
        x: "x" in n ? n.x : 0,
        y: "y" in n ? n.y : 0,
        width: "width" in n ? n.width : 0,
        height: "height" in n ? n.height : 0,
        visible: "visible" in n ? n.visible : true,
        opacity: "opacity" in n ? n.opacity : 1,
        fills: "fills" in n ? n.fills : undefined,
        strokes: "strokes" in n ? n.strokes : undefined,
        strokeWeight: "strokeWeight" in n ? n.strokeWeight : undefined,
        cornerRadius: "cornerRadius" in n ? n.cornerRadius : undefined,
        layoutMode: "layoutMode" in n ? n.layoutMode : undefined,
        itemSpacing: "itemSpacing" in n ? n.itemSpacing : undefined,
        paddingLeft: "paddingLeft" in n ? n.paddingLeft : undefined,
        paddingRight: "paddingRight" in n ? n.paddingRight : undefined,
        paddingTop: "paddingTop" in n ? n.paddingTop : undefined,
        paddingBottom: "paddingBottom" in n ? n.paddingBottom : undefined,
        primaryAxisAlignItems: "primaryAxisAlignItems" in n ? n.primaryAxisAlignItems : undefined,
        counterAxisAlignItems: "counterAxisAlignItems" in n ? n.counterAxisAlignItems : undefined,
        layoutGrow: "layoutGrow" in n ? n.layoutGrow : undefined,
        layoutAlign: "layoutAlign" in n ? n.layoutAlign : undefined,
        characters: "characters" in n ? n.characters : undefined,
        fontSize: "fontSize" in n ? n.fontSize : undefined,
        fontName: "fontName" in n ? n.fontName : undefined,
        lineHeight: "lineHeight" in n ? n.lineHeight : undefined,
        letterSpacing: "letterSpacing" in n ? n.letterSpacing : undefined,
      };
      if ("children" in n && depth < maxDepth) {
        info.children = n.children.map(c => serializeNode(c, depth + 1));
      }
      return info;
    }
    return serializeNode(target);
  }

  if (command.type === "export_node") {
    let target = null;
    if (payload.nodeId) target = figma.getNodeById(String(payload.nodeId));
    else if (payload.name) target = figma.currentPage.findOne(n => n.name === String(payload.name));
    else if (figma.currentPage.selection.length > 0) target = figma.currentPage.selection[0];
    else target = figma.currentPage;
    if (!target) throw new Error("Node for export not found");
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
