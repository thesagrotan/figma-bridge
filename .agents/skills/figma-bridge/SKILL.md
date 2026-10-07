---
name: figma-bridge
description: >-
  Complete context and tooling reference for the figma-bridge project — a Model
  Context Protocol server and local HTTP/WebSocket bridge to Figma Desktop.
  Use to inspect the open file, find nodes, apply edits, and verify changes directly.
---

# figma-bridge — Agent Operating Guide

## ⚠️ Default Assumptions & Hard Rules

> **1. Every user request is about editing or inspecting the file currently open and connected in Figma.**
> - **Do not ask** which file to use, what file key it has, or whether the request involves Figma.
> - **Treat the connected file as the target and start working immediately.**
>
> **2. DO NOT inspect the codebase, plugin code, or workspace files (besides skills).**
> - **Do not inspect** `plugin/code.js`, `plugin/ui.html`, `src/`, `package.json`, or any project directories.
> - **Do not run grep/find** across the codebase or explore the repository.
> - Everything you need is already running and wired. **Jump straight away into interacting with the Figma file via `POST http://localhost:3000/execute`.**

---

## ⚡ Fast Path (Start Here)

The bridge runs on `http://localhost:3000` (check `.bridge-port` if 3000 is occupied).
All bridge calls use header: `X-Bridge-Token: local-development-token` (or `FIGMA_BRIDGE_TOKEN` from `.env`).

```
[1. Confirm & Inspect] ──▶ [2. Find Node / Tree] ──▶ [3. Apply Edits] ──▶ [4. Verify & Export]
```

### Step 1: Confirm Connection & Open Document
Check bridge health and retrieve the open file name, current page, and selection:

```bash
curl -s -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Token: local-development-token" \
  -d '{"type":"inspect"}'
```
*Returns*: `{ "ok": true, "result": { "fileName": "Stringer", "currentPage": { "id": "96:5732", "name": "layout" }, ... } }`

### Step 2: Locate Target Nodes & Hierarchy
Get coordinates, layout, styling, and children of any frame by name or ID:

```bash
curl -s -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Token: local-development-token" \
  -d '{"type":"get_node_tree","payload":{"name":"to-recreate","maxDepth":5}}'
```

### Step 3: Apply Edits / Generate Designs
You can either:
1. **Send standard atomic operations** (`create_frame`, `create_text`, `update_node`, `set_fills`, `set_auto_layout`, `batch`):
```bash
curl -s -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Token: local-development-token" \
  -d '{
    "type": "create_frame",
    "payload": { "name": "New Frame", "x": 983, "y": 4149, "width": 900, "height": 700 }
  }'
```
2. **Execute a dedicated generation function** in `plugin/code.js` for complex multi-layer designs (preferred for full screen builds):
   - Add your function to `plugin/code.js` (hot-reloads automatically).
   - Trigger it via `POST /execute` with your command type.

### Step 4: Verify & Export Rendered Image
Export the node as base64 PNG, write to disk, and visually inspect with `view_file`:

```bash
curl -s -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Token: local-development-token" \
  -d '{"type":"export_node","payload":{"name":"recreated — SwiftUI Design","scale":2,"format":"PNG"}}' \
  | python3 -c 'import sys, json, base64; d = json.load(sys.stdin); open("preview.png", "wb").write(base64.b64decode(d["result"]["base64"])) if d.get("ok") else print(d)'
```

---

## 🚫 Don't Re-Derive (Waste No Time Here)

- ❌ **Do not inspect plugin code or codebase files**: Do not view, search, or grep `src/`, `plugin/`, `docs/`, or any repository files. Use the bridge API directly.
- ❌ **Do not use the Figma REST API for read loops**: Starter tier tokens hit `HTTP 429 Too Many Requests` with days-long retry-after limits. The local bridge has zero rate limits.
- ❌ **Do not call `/v1/teams/{id}/projects`**: Starter personal tokens return `403 Forbidden` on team project listings.
- ❌ **Do not use macOS `osascript` for UI automation**: System Events keystrokes fail with `error: osascript is not allowed assistive access (-1728)`.
- ❌ **Do not parse `settings.json` or grep local disk**: The bridge's `{"type": "inspect"}` command tells you the open file, pages, and selection in 10ms.
- ❌ **Do not assume the user only wants SwiftUI code**: If the user asks to "recreate frame X", they want the new design **built directly into the Figma file** (and optionally accompanied by SwiftUI code).

---

## 💡 Lessons Learned & Bridge Quirks

1. **Bridge Endpoints**:
   - `POST /execute` (or `POST /command`): executes any edit command synchronously and returns `{ ok: true, result: ... }`.
   - `GET /health`: checks if server is up (`{"ok": true, "name": "figma-bridge", "port": 3000}`).
   - Port auto-increment: if 3000 is occupied, the server increments (3001, 3002...) and records the active port in `.bridge-port`.

2. **Hot-Reloading in `plugin/code.js`**:
   - Changes to `plugin/code.js` take effect immediately on next command execution during dev mode.
   - Any custom command that does **not** take a `nodeId` must be routed **before** line `const node = figma.getNodeById(...)` in `code.js`, otherwise it errors with `"Node was not found"`.

3. **Figma Auto-Layout & Text Quirk**:
   - When placing text in Auto-Layout frames:
     - Set `frame.primaryAxisSizingMode = "AUTO"` and `frame.counterAxisSizingMode = "AUTO"` so badges/chips don't clip text.
     - For multi-line text, set `textNode.textAutoResize = "HEIGHT"` and `textNode.resize(width, height)` so lines wrap cleanly.
   - Always load fonts before setting text: `await figma.loadFontAsync({ family: "Inter", style: "Regular" })`.

4. **Coordinate & Positioning Rules**:
   - Place newly generated frames adjacent to target reference frames: `targetX = refFrame.x + refFrame.width + 60`, `targetY = refFrame.y`.
   - Always clean up previous generated versions: `const old = figma.currentPage.findOne(n => n.name === targetName); if (old) old.remove();`.
   - Always focus and select the output:
     ```javascript
     figma.currentPage.selection = [newFrame];
     figma.viewport.scrollAndZoomIntoView([refFrame, newFrame]);
     ```

5. **Design Standard (`swiftui-design-skill`)**:
   - Use SF Symbols / clean vector shapes. **No emoji as functional icons.**
   - Use authentic semantic brand colors (e.g. Bloomberg `#C0392B`, Reuters `#3F7A4E`, Fed `#2B71C0`).
   - Muted warm neutrals (`#FFFFFF`, `#F6F6F9`, `#E5E5EA`) instead of high-contrast generic AI gradients.

---

## 🛠️ Edit Command Reference

| Command | Payload Fields | Description |
|---|---|---|
| `inspect` | `{}` | Returns file name, current page, all pages, current selection |
| `get_node_tree` | `{ name?, nodeId?, maxDepth? }` | Serializes node hierarchy, layout, coordinates, styles |
| `export_node` | `{ name?, nodeId?, scale?, format? }` | Exports PNG/SVG as base64 string |
| `create_frame` | `{ name, width, height, x, y, parentId? }` | Creates a new Frame node |
| `create_text` | `{ characters, fontSize, name?, x, y, parentId? }` | Creates a Text node (auto-loads Inter) |
| `update_node` | `{ nodeId, name?, x?, y?, width?, height?, characters? }` | Updates geometry or text |
| `delete_node` | `{ nodeId }` | Removes node from canvas |
| `set_fills` | `{ nodeId, fills }` | Sets array of Figma Paint objects |
| `set_auto_layout` | `{ nodeId, layoutMode, itemSpacing, padding* }` | Sets Auto Layout properties |
| `batch` | `{ operations: [{ type, payload }] }` | Chains operations (use `parentId: "$prev"` for parentage) |
| `generate_recreated_frame` | `{}` | Generates the polished Stringer workstation design |
