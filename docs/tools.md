# Tools Reference

All four tools are registered by `src/index.ts`. Read tools call the Figma REST API;
`figma_edit` goes through the [local bridge](bridge.md).

## File key or URL

`fileKey` accepts either a raw file key (`abc123XYZ`) or any Figma URL. URLs matching
`figma.com/design/<key>/...` or `figma.com/file/<key>/...` are parsed down to the key
automatically:

```text
https://www.figma.com/design/abc123XYZ/My-File?node-id=1-2  →  abc123XYZ
```

---

## `figma_get_file`

Returns file metadata and the document tree.

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

Use a small `depth` first — full documents can be very large.

---

## `figma_get_nodes`

Returns specific nodes by ID.

| Input | Type | Required | Notes |
|---|---|---|---|
| `fileKey` | string | Yes | File key or Figma URL |
| `nodeIds` | string[] | Yes | Node IDs such as `"0:1"` or `"12:34"` |
| `version` | string | No | Figma file version ID |

```json
{
  "fileKey": "abc123XYZ",
  "nodeIds": ["1:2", "1:34"]
}
```

---

## `figma_render_nodes`

Returns image URLs for rendering nodes (the URLs expire, download promptly).

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `fileKey` | string | Yes | — | File key or Figma URL |
| `nodeIds` | string[] | Yes | — | Node IDs to render |
| `format` | `jpg` \| `png` \| `svg` \| `pdf` | No | `png` | Output format |
| `scale` | number 0.01–4 | No | `1` | Export scale |

```json
{
  "fileKey": "abc123XYZ",
  "nodeIds": ["1:2"],
  "format": "png",
  "scale": 2
}
```

---

## `figma_edit`

Executes a single edit command in the Figma file that is currently open in the desktop
app. Requires the plugin to be running — see [Figma Bridge](bridge.md).

| Input | Type | Required |
|---|---|---|
| `type` | `create_frame` \| `create_text` \| `update_node` \| `delete_node` \| `batch` | Yes |
| `payload` | object | No, defaults to `{}` |

The call blocks until the plugin reports a result or times out after **60 seconds**.

### `batch`

Executes an array of operations in a single tick inside Figma. Supports `$prev` as `parentId` to chain child layers into the previously created node:

```json
{
  "type": "batch",
  "payload": {
    "operations": [
      { "type": "create_frame", "payload": { "name": "Card", "width": 400, "height": 250, "x": 100, "y": 100 } },
      { "type": "create_text", "payload": { "parentId": "$prev", "characters": "Card Title", "fontSize": 20, "x": 20, "y": 20 } },
      { "type": "create_text", "payload": { "parentId": "$prev", "characters": "Subtitle", "fontSize": 14, "x": 20, "y": 50 } }
    ]
  }
}
```

### `create_frame`

| Field | Default | Description |
|---|---|---|
| `name` | `"MCP Frame"` | Layer name |
| `width` | `400` | Frame width |
| `height` | `300` | Frame height |
| `x` | `0` | X position |
| `y` | `0` | Y position |
| `parentId` | current page | ID of the node to append into |

```json
{
  "type": "create_frame",
  "payload": { "name": "Dashboard", "width": 1440, "height": 900, "x": 100, "y": 100 }
}
```

### `create_text`

| Field | Default | Description |
|---|---|---|
| `characters` | `"MCP text"` | Text content |
| `fontSize` | `16` | Font size |
| `name` | `"MCP Text"` | Layer name |
| `x` | `0` | X position |
| `y` | `0` | Y position |
| `parentId` | current page | Parent node ID |

```json
{
  "type": "create_text",
  "payload": { "characters": "Hello from MCP", "fontSize": 32, "x": 120, "y": 140 }
}
```

### `update_node`

`nodeId` is required; every other field is optional and applied only when present.

| Field | Applies to |
|---|---|
| `nodeId` | Any node (required) |
| `name` | Any node |
| `x`, `y` | Nodes with a position |
| `width`, `height` | Nodes that support `resize` |
| `characters` | Text nodes |

```json
{
  "type": "update_node",
  "payload": { "nodeId": "1:23", "characters": "Renamed heading", "x": 40 }
}
```

### `delete_node`

```json
{ "type": "delete_node", "payload": { "nodeId": "1:23" } }
```

### Result shape

```json
{ "ok": true, "result": { "id": "1:23", "name": "Dashboard" } }
```

```json
{ "ok": false, "error": "Node was not found" }
```

## See also

- [Figma Bridge](bridge.md) — running and debugging the edit pipeline
- [Troubleshooting](troubleshooting.md)
