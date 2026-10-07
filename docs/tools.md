# Tools Reference

`figma-bridge` registers two categories of MCP tools in `src/index.ts`:

1. **Read Tools (REST API)**: Query Figma's cloud REST API using `FIGMA_PERSONAL_ACCESS_TOKEN`.
2. **Canvas Bridge Tools**: Read and manipulate the active document live in Figma Desktop via the local bridge plugin.

---

## File Key or URL

All REST API read tools accept a `fileKey` parameter. You can supply either a raw file key (`abc123XYZ`) or any Figma URL. URLs matching `figma.com/design/<key>/...` or `figma.com/file/<key>/...` are parsed down to the key automatically:

```text
https://www.figma.com/design/abc123XYZ/My-File?node-id=1-2  →  abc123XYZ
```

---

## Read Tools (Figma REST API)

### `figma_get_file`

Returns file metadata and the document tree as JSON.

| Input | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or Figma URL |
| `version` | string | No | Figma file version ID |
| `depth` | int 1–10 | No | Limits how deep the tree is walked |

```json
{
  "fileKey": "https://www.figma.com/design/abc123XYZ/My-File",
  "depth": 3
}
```

> **Tip:** Use a small `depth` first — full documents can produce very large responses.

---

### `figma_get_nodes`

Returns specific nodes by ID from the document tree.

| Input | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or Figma URL |
| `nodeIds` | string[] | Yes | Array of node IDs such as `["0:1", "12:34"]` |
| `version` | string | No | Figma file version ID |

```json
{
  "fileKey": "abc123XYZ",
  "nodeIds": ["1:2", "1:34"]
}
```

---

### `figma_render_nodes`

Renders specific nodes to images.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `fileKey` | string | Yes | — | File key or Figma URL |
| `nodeIds` | string[] | Yes | — | Node IDs to render |
| `format` | `jpg` \| `png` \| `svg` \| `pdf` | No | `png` | Output format |
| `scale` | number 0.01–4 | No | `1` | Export scale factor |
| `returnBase64` | boolean | No | `false` | When `true`, returns base64 MCP image blocks |

```json
{
  "fileKey": "abc123XYZ",
  "nodeIds": ["1:2"],
  "format": "png",
  "scale": 2
}
```

---

### `figma_get_versions`

Returns the version history of a Figma file.

| Input | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or Figma URL |

```json
{
  "fileKey": "abc123XYZ"
}
```

---

### `figma_get_styles`

Returns all styles (colors, text, effects, grids) defined in a Figma file. Use this to discover and read design tokens.

| Input | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or Figma URL |
| `version` | string | No | Figma file version ID |

```json
{
  "fileKey": "abc123XYZ"
}
```

---

### `figma_get_components`

Returns all components and component sets published or defined in a Figma file. Use this to discover reusable components before creating new frames.

| Input | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or Figma URL |
| `version` | string | No | Figma file version ID |

```json
{
  "fileKey": "abc123XYZ"
}
```

---

### `figma_get_comments`

Returns all comments posted on a Figma file.

| Input | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or Figma URL |

```json
{
  "fileKey": "abc123XYZ"
}
```

---

### `figma_post_comment`

Posts a comment to a Figma file, optionally anchored to a specific canvas node.

| Input | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or Figma URL |
| `message` | string | Yes | Comment text |
| `nodeId` | string | No | Anchor comment to a specific node |
| `client_meta` | object | No | Coordinate metadata for anchor position |

```json
{
  "fileKey": "abc123XYZ",
  "message": "Please review this header alignment.",
  "nodeId": "1:23"
}
```

---

## Canvas Bridge Tools (Local Bridge)

These tools communicate with the **Figma desktop app** in real time via the local bridge plugin. They operate directly on the document currently open on your screen without cloud API rate limits.

---

### `use_figma`

Executes JavaScript code in the document context using the Figma Plugin API. Enables creating nodes, setting styles, auto-layout, variable bindings, and reading or mutating canvas state.

> **Important:** Always load the `figma-use` skill before calling `use_figma` to ensure correct Plugin API usage patterns and font loading.

| Input | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Yes | JavaScript code executed in document context |
| `skillNames` | string | No | Comma-separated skill names, e.g. `"figma-use"` |

```json
{
  "code": "const frame = figma.createFrame();\nframe.name = 'Card';\nframe.resize(320, 200);\nframe.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];\nfigma.currentPage.appendChild(frame);\nfigma.currentPage.selection = [frame];\nfigma.viewport.scrollAndZoomIntoView([frame]);\nreturn { id: frame.id, name: frame.name };"
}
```

The script runs in an async context and can use top-level `await` and `return`. The returned value is serialized as JSON in the MCP response.

---

### `get_screenshot`

Captures and exports a 2x PNG screenshot of a specific node, or the current selection / page if omitted. The image is returned directly to the MCP client as an image block for instant visual verification.

| Input | Type | Required | Notes |
|---|---|---|---|
| `nodeId` | string | No | Node ID to capture. If omitted, captures selection or current page |
| `name` | string | No | Node name to capture |

```json
{
  "nodeId": "1:23"
}
```

---

### `get_metadata`

Inspects document metadata or traverses a node tree hierarchy in the active document.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | No | — | Node ID to inspect. If omitted, returns document / current page metadata |
| `maxDepth` | number | No | `4` | Maximum tree depth to traverse when `nodeId` is provided |

When `nodeId` is omitted, returns document-level metadata including file name, current page, and selection:

```json
{}
```

When `nodeId` is provided, traverses the node tree under that ID up to `maxDepth`:

```json
{
  "nodeId": "1:23",
  "maxDepth": 3
}
```

---

## See also

- [Figma Bridge](bridge.md) — Real-time WebSocket connection and bridge protocol
- [Troubleshooting](troubleshooting.md) — Diagnosing connection, timing, and canvas issues
