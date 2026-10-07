---
name: figma-bridge
description: >-
  Complete context and tooling reference for the figma-bridge project — a Model
  Context Protocol server that exposes Figma read tools and controlled edits
  through a local Figma plugin bridge. Activate when working on this codebase
  to understand the architecture, all available MCP tools, the bridge protocol,
  and development workflows.
---

# figma-bridge — Project Context & Tooling Reference

## Overview

**figma-bridge** is a TypeScript MCP (Model Context Protocol) server that gives AI agents
structured access to Figma files. It exposes Figma REST API read operations as MCP tools
and routes design edits through a local WebSocket/HTTP bridge that talks to a bundled
Figma desktop plugin.

- **Transport**: stdio (MCP over stdin/stdout)
- **Bridge**: local HTTP + WebSocket on `127.0.0.1:3000` (auto-increments if busy)
- **Runtime**: Node.js ESM, TypeScript compiled with `tsc` or run directly with `tsx`
- **Key env vars**: `FIGMA_PERSONAL_ACCESS_TOKEN` (required), `FIGMA_BRIDGE_TOKEN` (default `local-development-token`), `PORT` (default `3000`)

---

## Project Structure

```
figma-bridge/
├── src/
│   ├── index.ts                  # Entry point — wires MCP server + bridge
│   ├── figmaApi.ts               # Figma REST API client (uses FIGMA_PERSONAL_ACCESS_TOKEN)
│   ├── types/
│   │   └── commands.ts           # EditCommandType union, EditCommand, EditResult, fileKeySchema
│   ├── bridge/
│   │   ├── http.ts               # Local HTTP bridge server (queue drain + result delivery)
│   │   ├── websocket.ts          # WebSocket upgrade on the bridge server (real-time push)
│   │   └── queue.ts              # In-memory editQueue and editWaiters
│   └── tools/
│       ├── read.ts               # figma_get_file, figma_get_nodes, figma_render_nodes, figma_get_versions
│       ├── styles.ts             # figma_get_styles
│       ├── components.ts         # figma_get_components
│       └── comments.ts           # figma_get_comments, figma_post_comment
├── plugin/
│   ├── manifest.json             # Figma plugin manifest
│   ├── code.js                   # Plugin sandbox — executes edit commands on nodes
│   └── ui.html                   # Plugin UI — WebSocket client + HTTP fallback polling
├── docs/
│   ├── README.md                 # Docs index
│   ├── setup.md                  # First-run setup guide
│   ├── tools.md                  # Full tool parameter reference
│   ├── bridge.md                 # Bridge architecture and HTTP protocol
│   └── troubleshooting.md        # Common errors and fixes
├── scripts/
│   ├── install-service.sh        # Install as macOS LaunchAgent (auto-start at login)
│   └── uninstall-service.sh      # Remove LaunchAgent
├── .env                          # Local secrets (gitignored)
├── .env.example                  # Template
├── .bridge-port                  # Runtime file — active bridge port (written on startup)
├── tsconfig.json                 # target ES2022, module NodeNext
└── package.json
```

---

## npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run build` | `tsc` | Compile TypeScript → `dist/` |
| `npm run typecheck` | `tsc --noEmit` | Type-check without emitting |
| `npm start` | `tsx src/index.ts` | Run server in dev mode (no build step) |
| `npm run start:dist` | `node dist/index.js` | Run compiled output |
| `npm run service:install` | `bash scripts/install-service.sh` | Install macOS LaunchAgent |
| `npm run service:uninstall` | `bash scripts/uninstall-service.sh` | Remove macOS LaunchAgent |
| `npm run service:logs` | `tail -f ~/Library/Logs/figma-bridge/stderr.log` | Tail service logs |

---

## All MCP Tools

### Read Tools (`src/tools/read.ts`)

#### `figma_get_file`
Fetches a Figma file's full JSON (metadata + document tree).

| Param | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or full Figma URL (auto-extracted) |
| `version` | string | No | Figma file version ID |
| `depth` | number 1–10 | No | Limit document tree depth — start small, full files are huge |

#### `figma_get_nodes`
Returns specific nodes by ID.

| Param | Type | Required |
|---|---|---|
| `fileKey` | string | Yes |
| `nodeIds` | string[] | Yes — e.g. `["1:2", "12:34"]` |
| `version` | string | No |

> **Note**: Node IDs in URLs use dashes (`node-id=1-2`); the API needs colons (`1:2`). Always convert.

#### `figma_render_nodes`
Returns rendered image URLs (expire quickly — download immediately).

| Param | Type | Default |
|---|---|---|
| `fileKey` | string | — |
| `nodeIds` | string[] | — |
| `format` | `jpg` \| `png` \| `svg` \| `pdf` | `png` |
| `scale` | number 0.01–4 | `1` |
| `returnBase64` | boolean | `false` — when true, fetches images and returns base64 blobs inline |

#### `figma_get_versions`
Returns the full version history of a file.

| Param | Type | Required |
|---|---|---|
| `fileKey` | string | Yes |

---

### Styles Tool (`src/tools/styles.ts`)

#### `figma_get_styles`
Returns all styles (colors, typography, effects, grids) defined in a file — useful for reading design tokens.

| Param | Type | Required |
|---|---|---|
| `fileKey` | string | Yes |
| `version` | string | No |

---

### Components Tool (`src/tools/components.ts`)

#### `figma_get_components`
Returns all components and component sets. Use before creating new frames to discover existing reusable components.

| Param | Type | Required |
|---|---|---|
| `fileKey` | string | Yes |
| `version` | string | No |

Returns `{ components, componentSets }` combined in one call.

---

### Comments Tools (`src/tools/comments.ts`)

#### `figma_get_comments`
Gets all comments on a Figma file.

| Param | Type | Required |
|---|---|---|
| `fileKey` | string | Yes |

#### `figma_post_comment`
Posts a comment, optionally anchored to a node.

| Param | Type | Required |
|---|---|---|
| `fileKey` | string | Yes |
| `message` | string | Yes |
| `nodeId` | string | No |
| `client_meta` | object | No |

---

### Edit Tool — via Bridge (`figma_edit`)

> **Requires the Figma plugin to be running.** The edit tool is not registered in `src/tools/read.ts` — it must be implemented via the bridge. Commands time out after **60 seconds**.

Executes a single edit command against the currently open Figma file in the desktop app.

| Param | Type | Required |
|---|---|---|
| `type` | EditCommandType | Yes |
| `payload` | object | No (defaults `{}`) |

#### Supported `EditCommandType` values

Defined in [`src/types/commands.ts`](file:///Users/daniel/Developer/figma-bridge/src/types/commands.ts):

```
create_frame | create_text | update_node | delete_node | batch
| create_component | create_instance | set_fills | set_text_style
| set_auto_layout | move_to_page | group_nodes | export_node
| create_section | set_prototype_link | set_variable_binding
```

> All `EditCommandType` values are fully implemented in [`plugin/code.js`](file:///Users/daniel/Developer/figma-bridge/plugin/code.js).

#### `batch` — chain operations in one Figma tick

Use `"$prev"` as `parentId` to reference the node just created:

```json
{
  "type": "batch",
  "payload": {
    "operations": [
      { "type": "create_frame", "payload": { "name": "Card", "width": 400, "height": 250, "x": 100, "y": 100 } },
      { "type": "create_text", "payload": { "parentId": "$prev", "characters": "Card Title", "fontSize": 20, "x": 20, "y": 20 } }
    ]
  }
}
```

#### `create_frame` payload fields

| Field | Default | Description |
|---|---|---|
| `name` | `"MCP Frame"` | Layer name |
| `width` | `400` | Frame width |
| `height` | `300` | Frame height |
| `x` | `0` | X position |
| `y` | `0` | Y position |
| `parentId` | current page | Parent node ID |

#### `create_text` payload fields

| Field | Default | Description |
|---|---|---|
| `characters` | `"MCP text"` | Text content |
| `fontSize` | `16` | Font size |
| `name` | `"MCP Text"` | Layer name |
| `x` | `0` | X position |
| `y` | `0` | Y position |
| `parentId` | current page | Parent node ID |

#### `create_component` payload fields

Same fields as `create_frame`: `name`, `width` (default 200), `height` (default 100), `x`, `y`, `parentId`.

#### `create_instance` payload fields

| Field | Required | Description |
|---|---|---|
| `componentId` | Yes | Node ID of the source COMPONENT node |
| `x` | No | X position (default 0) |
| `y` | No | Y position (default 0) |
| `parentId` | No | Parent node ID (default current page) |

Returns `{ id, name, mainComponentId }`.

#### `create_section` payload fields

| Field | Default | Description |
|---|---|---|
| `name` | `"MCP Section"` | Section name |
| `x` / `y` | `0` | Position |
| `width` / `height` | 800 / 600 | Size (optional) |
| `parentId` | current page | Parent node ID |

#### `group_nodes` payload fields

| Field | Required | Description |
|---|---|---|
| `nodeIds` | Yes | Array of node IDs to group |
| `name` | No | Name for the resulting group |
| `parentId` | No | Parent context for the group |

Returns `{ id, name }` of the new group.

#### `update_node` — `nodeId` required, all others optional

Supports: `name`, `x`, `y`, `width`, `height`, `characters`

#### `delete_node`

```json
{ "type": "delete_node", "payload": { "nodeId": "1:23" } }
```

#### `set_fills` — `nodeId` required

| Field | Required | Description |
|---|---|---|
| `nodeId` | Yes | Target node ID |
| `fills` | Yes | Array of Figma `Paint` objects (e.g. `[{ "type": "SOLID", "color": { "r": 1, "g": 0, "b": 0 } }]`) |

#### `set_text_style` — `nodeId` must be a TEXT node

| Field | Description |
|---|---|
| `fontFamily` | Font family name (default `"Inter"`) |
| `fontStyle` | Font style/weight e.g. `"Bold"`, `"Semi Bold"` (default `"Regular"`) |
| `fontSize` | Number |
| `lineHeight` | e.g. `{ "value": 24, "unit": "PIXELS" }` or `{ "unit": "AUTO" }` |
| `letterSpacing` | e.g. `{ "value": 0.5, "unit": "PIXELS" }` |
| `textCase` | `"UPPER"` | `"LOWER"` | `"TITLE"` | `"ORIGINAL"` |
| `textDecoration` | `"UNDERLINE"` | `"STRIKETHROUGH"` | `"NONE"` |
| `textAlignHorizontal` | `"LEFT"` | `"CENTER"` | `"RIGHT"` | `"JUSTIFIED"` |
| `textAlignVertical` | `"TOP"` | `"CENTER"` | `"BOTTOM"` |

#### `set_auto_layout` — `nodeId` must be a FRAME or COMPONENT

| Field | Default | Description |
|---|---|---|
| `layoutMode` | `"HORIZONTAL"` | `"HORIZONTAL"` | `"VERTICAL"` | `"NONE"` |
| `itemSpacing` | — | Gap between children |
| `paddingLeft` / `paddingRight` / `paddingTop` / `paddingBottom` | — | Individual padding |
| `primaryAxisAlignItems` | — | `"MIN"` | `"CENTER"` | `"MAX"` | `"SPACE_BETWEEN"` |
| `counterAxisAlignItems` | — | `"MIN"` | `"CENTER"` | `"MAX"` | `"BASELINE"` |
| `layoutWrap` | — | `"NO_WRAP"` | `"WRAP"` |
| `counterAxisSpacing` | — | Gap between wrapped rows/columns |

#### `move_to_page` — `nodeId` required

| Field | Required | Description |
|---|---|---|
| `nodeId` | Yes | Node to move |
| `pageId` | One of | Target page ID |
| `pageName` | One of | Target page name (matched if `pageId` not given) |

#### `export_node` — `nodeId` required

| Field | Default | Description |
|---|---|---|
| `nodeId` | — | Node to export |
| `format` | `"PNG"` | `"PNG"` | `"JPG"` | `"SVG"` | `"PDF"` |
| `scale` | `1` | Export scale (e.g. `2` for @2x) |

Returns `{ id, name, format, base64, byteLength }`. The `base64` field contains the raw file bytes encoded in base64.

#### `set_prototype_link` — `nodeId` required

| Field | Default | Description |
|---|---|---|
| `nodeId` | — | Source node that receives the interaction |
| `destinationId` | **required** | Target node ID to navigate to |
| `navigation` | `"NAVIGATE"` | `"NAVIGATE"` | `"SWAP"` | `"OVERLAY"` | `"SCROLL_TO"` | `"CHANGE_TO"` |
| `triggerType` | `"ON_CLICK"` | `"ON_CLICK"` | `"ON_HOVER"` | `"ON_PRESS"` | `"ON_KEY_DOWN"` | `"AFTER_TIMEOUT"` |
| `transition` | `null` | Optional transition object |
| `preserveScrollPosition` | `false` | Whether to preserve scroll on navigate |

Appends to existing reactions — does not overwrite them. Returns `{ id, name, reactionCount }`.

#### `set_variable_binding` — `nodeId` required

Binds a Figma variable to a node property.

| Field | Required | Description |
|---|---|---|
| `nodeId` | Yes | Node to bind the variable to |
| `variableId` | Yes | ID of the Figma variable (from `figma.variables`) |
| `field` | Yes | Node property to bind, e.g. `"fills"`, `"width"`, `"height"`, `"itemSpacing"`, `"paddingLeft"`, etc. |

#### Result shape

```json
{ "ok": true, "result": { "id": "1:23", "name": "Dashboard" } }
{ "ok": false, "code": "NOT_FOUND", "error": "Node was not found" }
```

---

## Bridge Architecture

The edit pipeline uses real-time WebSocket push with HTTP polling fallback:

```
MCP client
  → figma_edit(type, payload)
  → MCP server (src/index.ts)
  → WebSocket push → plugin/ui.html
  → pluginMessage → plugin/code.js
  → executes on Figma nodes
  → result streamed back via WebSocket
```

### Bridge HTTP endpoints (`127.0.0.1:PORT`)

| Method | Path | Auth | Behavior |
|---|---|---|---|
| `GET` | `/health` | No | Returns `{ok, name, port, authenticated}` |
| `GET` | `/commands` | Yes | Dequeues pending commands |
| `POST` | `/results/:id` | Yes | Delivers result for a command |

Auth header: `X-Bridge-Token: <FIGMA_BRIDGE_TOKEN>`

### Smoke test

```bash
curl -H "X-Bridge-Token: local-development-token" http://127.0.0.1:3000/commands
# null → bridge healthy, queue empty
```

---

## `fileKey` Input

All tools accept either a raw file key or a full Figma URL. The `fileKeySchema` in
[`src/types/commands.ts`](file:///Users/daniel/Developer/figma-bridge/src/types/commands.ts)
extracts the key automatically via regex:

```
https://www.figma.com/design/abc123XYZ/My-File → abc123XYZ
https://www.figma.com/file/abc123XYZ/My-File  → abc123XYZ
abc123XYZ                                      → abc123XYZ (passed through)
```

---

## Development Workflow

### Run in dev mode
```bash
npm start   # tsx src/index.ts — no build needed
```

### Type-check
```bash
npm run typecheck
```

### Build for production / LaunchAgent
```bash
npm run build   # tsc → dist/
```

### Add a new tool
1. Create or edit a file in `src/tools/`.
2. Export a `registerXxxTools(server: McpServer): void` function.
3. Import and call it inside `registerReadTools()` in [`src/tools/read.ts`](file:///Users/daniel/Developer/figma-bridge/src/tools/read.ts).

### Add a new edit command type
1. Add the type literal to `EditCommandType` in [`src/types/commands.ts`](file:///Users/daniel/Developer/figma-bridge/src/types/commands.ts).
2. Implement the handler in `plugin/code.js` (the plugin sandbox).
3. Update `plugin/manifest.json` `networkAccess.allowedDomains` if needed.
4. Re-import the plugin manifest in Figma desktop.

### Run as a macOS background service
```bash
npm run service:install    # builds, writes LaunchAgent plist, starts it
npm run service:logs       # tail stderr
npm run service:uninstall  # remove
```

---

## Key Files Quick Reference

| File | Purpose |
|---|---|
| [`src/index.ts`](file:///Users/daniel/Developer/figma-bridge/src/index.ts) | Entry: creates MCP server, registers tools, starts bridge |
| [`src/figmaApi.ts`](file:///Users/daniel/Developer/figma-bridge/src/figmaApi.ts) | Figma REST client — all HTTP calls go through here |
| [`src/types/commands.ts`](file:///Users/daniel/Developer/figma-bridge/src/types/commands.ts) | `EditCommandType`, `EditCommand`, `EditResult`, `fileKeySchema` |
| [`src/bridge/http.ts`](file:///Users/daniel/Developer/figma-bridge/src/bridge/http.ts) | Bridge HTTP server, `startBridgeServer`, port auto-increment |
| [`src/bridge/websocket.ts`](file:///Users/daniel/Developer/figma-bridge/src/bridge/websocket.ts) | WebSocket upgrade on bridge server |
| [`src/bridge/queue.ts`](file:///Users/daniel/Developer/figma-bridge/src/bridge/queue.ts) | In-memory `editQueue` and `editWaiters` |
| [`src/tools/read.ts`](file:///Users/daniel/Developer/figma-bridge/src/tools/read.ts) | `figma_get_file`, `figma_get_nodes`, `figma_render_nodes`, `figma_get_versions` |
| [`src/tools/styles.ts`](file:///Users/daniel/Developer/figma-bridge/src/tools/styles.ts) | `figma_get_styles` |
| [`src/tools/components.ts`](file:///Users/daniel/Developer/figma-bridge/src/tools/components.ts) | `figma_get_components` |
| [`src/tools/comments.ts`](file:///Users/daniel/Developer/figma-bridge/src/tools/comments.ts) | `figma_get_comments`, `figma_post_comment` |
| [`plugin/code.js`](file:///Users/daniel/Developer/figma-bridge/plugin/code.js) | Figma plugin sandbox — executes edit commands on nodes |
| [`plugin/ui.html`](file:///Users/daniel/Developer/figma-bridge/plugin/ui.html) | Plugin UI — WebSocket client + HTTP fallback polling |

---

## Common Troubleshooting

| Symptom | Fix |
|---|---|
| `FIGMA_PERSONAL_ACCESS_TOKEN is required` | Copy `.env.example` → `.env`, set the token |
| Figma API 401/403 | Regenerate token in Figma → Settings → Security → Personal access tokens |
| `Timed out waiting for the Figma plugin` | Open the plugin in Figma desktop, check bridge token matches |
| `Bridge returned 401` in plugin | Token mismatch — align `FIGMA_BRIDGE_TOKEN` with the plugin window field |
| Node IDs with `-` instead of `:` | Figma URLs use `1-2`; replace with `1:2` before calling tools |
| `figma_get_file` responses are huge | Pass `depth` (1–10) to limit the document tree |
| Port conflict | Bridge auto-increments from 3000; check `.bridge-port` file for active port |
