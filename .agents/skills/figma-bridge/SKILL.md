---
name: figma-bridge
description: >-
  Infrastructure and routing guide for figma-bridge — a Model Context Protocol server
  and local WebSocket/HTTP bridge to Figma Desktop. Covers connection state, execution methods,
  and delegates design, canvas scripting, and translation tasks to specialized skills.
---

# figma-bridge — Infrastructure & Operating Guide

## ⚠️ Default Assumptions & Core Rules

> **1. Target the currently open file in Figma Desktop.**
> - Every user request refers to the file actively open and connected via the **Local Figma Bridge** desktop plugin.
> - Do not prompt for a file key, file URL, or ask if the request is about Figma.
>
> **2. The bridge has zero rate limits.**
> - Use the local bridge tools (`use_figma`, `get_metadata`, `get_screenshot`) for read and write operations.
> - Avoid Figma REST API read loops which trigger strict rate limits on Personal Access Tokens.
>
> **3. Delegate domain-specific tasks to installed skills.**
> - Do not guess Plugin API syntax or reinvent layout algorithms in this skill.
> - Load the appropriate specialized skill from `.agents/skills/` based on the task (see Skill Router below).

---

## 🧭 Skill Router

Choose the right skill to accompany your operations:

| Task / Domain | Skill to Load | Purpose |
|---|---|---|
| **Executing JS on Canvas** | [`figma-use`](../figma-use/SKILL.md) | **Mandatory for `use_figma`.** API rules, top-level `await`, typings, geometry, fills, auto-layout. |
| **Figma → Web Code** | [`figma-design-to-code`](../figma-design-to-code/SKILL.md) | Translating Figma frames into React, Tailwind, HTML/CSS with high fidelity. |
| **Figma → SwiftUI** | [`figma-swiftui`](../figma-swiftui/SKILL.md) | Translating Figma frames into SwiftUI code. |

---

## 🛠️ Execution Methods

### 1. Direct MCP Tools (Primary)

When interacting via the MCP client, call the Canvas tools directly:

- **`use_figma({ code })`**: Executes arbitrary JavaScript natively via the Figma Plugin API inside the open document. Always load `figma-use` first.
- **`get_screenshot({ nodeId?, name? })`**: Captures a 2x PNG rendering of the specified node or current page directly into your context.
- **`get_metadata({ nodeId?, maxDepth? })`**: Returns document metadata (when `nodeId` is omitted) or serializes the node subtree hierarchy.

### 2. HTTP Bridge API (Alternative / Fallback)

The bridge runs locally on `http://localhost:3000` (or the port recorded in `.bridge-port`).
Requests require header: `X-Bridge-Token: local-development-token` (or `FIGMA_BRIDGE_TOKEN` from `.env`).

```bash
# Check connection and open file
curl -s -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Token: local-development-token" \
  -d '{"type":"get_node_tree"}'

# Execute arbitrary Plugin API code
curl -s -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Token: local-development-token" \
  -d '{"type":"use_figma","payload":{"code":"return { name: figma.root.name };"}}'

# Export node screenshot to disk
curl -s -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Token: local-development-token" \
  -d '{"type":"export_node","payload":{"nodeId":"0:1","scale":2,"format":"PNG"}}' \
  | python3 -c 'import sys, json, base64; d = json.load(sys.stdin); open("preview.png", "wb").write(base64.b64decode(d["result"]["base64"])) if d.get("ok") else print(d)'
```

---

## ⚡ Fast Workflow

```
[1. Inspect File] ──▶ [2. Find Node Hierarchy] ──▶ [3. Apply Edits via use_figma] ──▶ [4. Verify with Screenshot]
```

1. **Inspect Active File**: Call `get_metadata()` without arguments (or `{"type": "inspect"}`) to get file name, current page ID, and selection.
2. **Locate Target Node**: Call `get_metadata({ nodeId, maxDepth: 5 })` to retrieve coordinates, sizing, and children.
3. **Execute Mutations**: Use `use_figma` following [`figma-use`](../figma-use/SKILL.md) patterns. Always return created or modified IDs:
   ```javascript
   return {
     createdNodeIds: [frame.id],
     mutatedNodeIds: [existingNode.id]
   };
   ```
4. **Visually Verify**: Call `get_screenshot({ nodeId })` to inspect the rendered result and confirm alignment, colors, and typography.

---

## 💡 Bridge Quirks & Technical Reference

1. **Port Auto-Increment**:
   - If port 3000 is occupied, the bridge server increments to 3001, 3002, etc., and writes the active port number to `.bridge-port`. Always check `.bridge-port` if 3000 fails.
2. **Health Check**:
   - `GET /health` returns `{ "ok": true, "name": "figma-bridge", "port": 3000 }`.
3. **Hot-Reloading in `plugin/code.js`**:
   - Changes to `plugin/code.js` hot-reload on the next command invocation when the desktop plugin is running in development mode.
4. **Selection & Viewport Focus**:
   - After creating or editing nodes via `use_figma`, keep the user oriented by updating selection and scrolling the viewport:
     ```javascript
     figma.currentPage.selection = [newNode];
     figma.viewport.scrollAndZoomIntoView([newNode]);
     ```
