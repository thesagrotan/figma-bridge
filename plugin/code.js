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

// Walk the source and its clone in lockstep to build an oldId -> newId map.
function mapCloneIds(source, clone, map) {
  map.set(source.id, clone.id);
  if ("children" in source && "children" in clone) {
    const length = Math.min(source.children.length, clone.children.length);
    for (let i = 0; i < length; i++) {
      mapCloneIds(source.children[i], clone.children[i], map);
    }
  }
}

function solidPaint(rgba) {
  return { type: "SOLID", color: { r: rgba.r, g: rgba.g, b: rgba.b }, opacity: rgba.a };
}

// Apply a validated change set to a cloned node. Returns applied kinds and
// non-fatal warnings. Never throws for a single unsupported property.
async function applyChangeSet(clone, changes, map) {
  const applied = [];
  const warnings = [];

  for (const change of changes) {
    // Fail closed: only ids present in the remap table may be written. Falling
    // back to the raw id could mutate the original document or a node that
    // drifted since the snapshot was taken.
    const targetId = map.has(change.targetId) ? map.get(change.targetId) : null;
    if (!targetId) {
      warnings.push(`Skipped ${change.kind}: ${change.targetId} is not part of the duplicated component.`);
      continue;
    }
    const node = figma.getNodeById(targetId);
    if (!node) {
      warnings.push(`Skipped ${change.kind}: node ${change.targetId} not found in the duplicate.`);
      continue;
    }

    try {
      switch (change.kind) {
        case "fill": {
          if (!("fills" in node)) { warnings.push(`Skipped fill: ${node.name} has no fills.`); break; }
          const current = Array.isArray(node.fills) ? node.fills : [];
          const solids = current.filter((p) => p.type === "SOLID");
          const others = current.filter((p) => p.type !== "SOLID");
          if (solids.length === 0) { warnings.push(`Skipped fill: ${node.name} has no solid paint.`); break; }
          const next = solids.map((p, index) => (index === 0 ? solidPaint(change.to) : p));
          node.fills = [...next, ...others];
          applied.push(change.kind);
          break;
        }
        case "strokeColor": {
          if (!("strokes" in node)) { warnings.push(`Skipped stroke: ${node.name} has no strokes.`); break; }
          node.strokes = [solidPaint(change.to)];
          applied.push(change.kind);
          break;
        }
        case "strokeWeight": {
          if (!("strokeWeight" in node)) { warnings.push(`Skipped stroke weight on ${node.name}.`); break; }
          node.strokeWeight = change.to;
          applied.push(change.kind);
          break;
        }
        case "cornerRadius": {
          if (!("cornerRadius" in node)) { warnings.push(`Skipped radius: ${node.name} does not support it.`); break; }
          node.cornerRadius = change.to;
          applied.push(change.kind);
          break;
        }
        case "itemSpacing": {
          if (!("itemSpacing" in node)) { warnings.push(`Skipped spacing on ${node.name}.`); break; }
          node.itemSpacing = change.to;
          applied.push(change.kind);
          break;
        }
        case "padding": {
          if (!("paddingTop" in node)) { warnings.push(`Skipped padding on ${node.name}.`); break; }
          node.paddingTop = change.to.top;
          node.paddingRight = change.to.right;
          node.paddingBottom = change.to.bottom;
          node.paddingLeft = change.to.left;
          applied.push(change.kind);
          break;
        }
        case "fontSize": {
          if (node.type !== "TEXT") { warnings.push(`Skipped font size: ${node.name} is not text.`); break; }
          await ensureFontLoaded(node.fontName);
          node.fontSize = change.to;
          applied.push(change.kind);
          break;
        }
        case "fontStyle": {
          if (node.type !== "TEXT") { warnings.push(`Skipped font style: ${node.name} is not text.`); break; }
          await ensureFontLoaded({ family: node.fontName.family, style: change.to });
          node.fontName = { family: node.fontName.family, style: change.to };
          applied.push(change.kind);
          break;
        }
        case "letterSpacing": {
          if (node.type !== "TEXT") { warnings.push(`Skipped tracking: ${node.name} is not text.`); break; }
          await ensureFontLoaded(node.fontName);
          node.letterSpacing = { unit: "PIXELS", value: change.to };
          applied.push(change.kind);
          break;
        }
        case "opacity": {
          node.opacity = change.to;
          applied.push(change.kind);
          break;
        }
        default:
          warnings.push(`Unknown change kind: ${change.kind}`);
      }
    } catch (error) {
      warnings.push(`${change.kind} failed on ${node.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { applied, warnings };
}

// Duplicate the source, apply changes, and return the duplicate plus a report.
async function duplicateWithChanges(payload) {
  const source = resolveTarget(payload);
  if (!source) throw new Error("Source node not found");
  if (source.type === "PAGE" || !source.parent) {
    throw new Error("Cannot duplicate this node: it has no parent container.");
  }
  if ("locked" in source && source.locked) {
    throw new Error("Cannot duplicate a locked node. Unlock it first.");
  }

  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  const clone = source.clone();
  const parent = source.parent;
  if (typeof parent.appendChild === "function") {
    const index = typeof parent.children !== "undefined" ? parent.children.indexOf(source) : -1;
    if (index >= 0 && typeof parent.insertChild === "function") parent.insertChild(index + 1, clone);
    else parent.appendChild(clone);
  } else {
    clone.remove();
    throw new Error("Source node's parent cannot accept children.");
  }

  try {
    // Detach an auto-layout clone so it visually separates from the original
    // instead of being absorbed into the same flow as its sibling. Figma only
    // allows ABSOLUTE positioning when the parent is an auto-layout frame.
    const cloneParent = clone.parent;
    if (
      "layoutPositioning" in clone &&
      cloneParent &&
      "layoutMode" in cloneParent &&
      cloneParent.layoutMode !== "NONE"
    ) {
      clone.layoutPositioning = "ABSOLUTE";
    }

    // Component instances get a variant label unless the caller renames it.
    const map = new Map();
    mapCloneIds(source, clone, map);
    const { applied, warnings } = await applyChangeSet(clone, changes, map);

    if (applied.length === 0 && changes.length > 0) {
      warnings.push("No changes could be applied; the duplicate matches the original.");
    }

    return { source, clone, applied, warnings };
  } catch (error) {
    // The clone is already in the document, so a failure here would leak it.
    try {
      clone.remove();
    } catch (_) {
      // ignore: best-effort cleanup
    }
    throw error;
  }
}

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
    const target = resolveTarget(payload);
    if (!target) throw new Error("Target node not found");
    const maxDepth = Number(payload.maxDepth || 10);
    return serializeNode(target, 0, maxDepth, newState(5000));
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

  // --- PARALLEL ----------------------------------------------------------
  if (command.type === "parallel_snapshot") {
    // PARALLEL always needs an explicit component; never fall back to the whole
    // page, which cannot be duplicated and would produce a huge payload.
    let target = null;
    if (payload.nodeId) target = figma.getNodeById(String(payload.nodeId));
    else if (payload.name) target = figma.currentPage.findOne((n) => n.name === String(payload.name));
    else if (figma.currentPage.selection.length > 0) target = figma.currentPage.selection[0];
    if (!target) throw new Error("Select a component or pass a nodeId before exploring.");
    if (target.type === "PAGE" || !target.parent) {
      throw new Error("Select a component inside a page, not the page itself.");
    }

    const state = newState(Number(payload.maxNodes || 600));
    const root = serializeNode(target, 0, Number(payload.maxDepth || 12), state);
    return {
      root,
      context: {
        fileName: figma.root && figma.root.name ? figma.root.name : null,
        pageName: figma.currentPage.name,
        selectionIds: figma.currentPage.selection.map((n) => n.id),
        truncated: state.truncated,
      },
    };
  }

  if (command.type === "parallel_preview") {
    const scale = Number(payload.scale || 2);
    const { source, clone, warnings } = await duplicateWithChanges(payload);
    try {
      const bytes = await clone.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: scale },
      });
      return {
        variationId: payload.variationId || null,
        sourceNodeId: source.id,
        base64: figma.base64Encode(bytes),
        width: Math.round(clone.width * scale),
        height: Math.round(clone.height * scale),
        appliedKinds: [],
        warnings,
      };
    } finally {
      // Preview nodes are transient: never leave them in the document.
      clone.remove();
    }
  }

  if (command.type === "parallel_apply") {
    const { source, clone, applied, warnings } = await duplicateWithChanges(payload);
    const createdNodeId = clone.id;

    // Everything after creation is cosmetic. A failure here must not hide the
    // created node, or the caller could never discard it.
    try {
      const mode = String(payload.mode || "variation");
      clone.name = `${source.name} · ${mode}`;
      const gap = 80;
      const parentIsAutoLayout = "layoutMode" in (source.parent || {}) && source.parent.layoutMode !== "NONE";
      if (!parentIsAutoLayout) {
        clone.x = source.x + source.width + gap;
        clone.y = source.y;
      }
      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);
    } catch (error) {
      warnings.push(`Placed the duplicate but could not focus it: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      variationId: payload.variationId || null,
      sourceNodeId: source.id,
      createdNodeId,
      createdNodeName: clone.name,
      appliedKinds: applied,
      warnings,
    };
  }

  if (command.type === "parallel_discard") {
    const node = figma.getNodeById(String(payload.nodeId || ""));
    if (!node) throw new Error("Node to discard was not found (it may already be gone).");
    const name = node.name;
    node.remove();
    return { removedNodeId: String(payload.nodeId), removedNodeName: name };
  }

  throw new Error("Unknown command type: " + command.type);
}
