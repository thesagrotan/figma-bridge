# Tools reference

The server exposes exactly three MCP tools.

## Multi-file routing

Each connected plugin window reports a `fileName` and `sessionId`. With one window, commands go to it automatically. With several windows, all three tools accept an optional `file` argument:

```json
{ "file": "Marketing site" }
```

`file` matches the exact `fileName` or `sessionId`. If it is missing or matches nothing, the tool returns an error listing the connected candidates. No other file or link parameters exist.

## `use_figma`

Runs JavaScript in the Figma plugin sandbox with direct access to `figma.*`.

| Input | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Yes | Plugin API code |
| `skillNames` | string | No | Accepted for compatibility with Figma clients; ignored |
| `file` | string | No | Required only when several plugins are connected |

- The code runs inside an async wrapper, so top-level `await` and `return` work.
- The returned value is serialized as JSON in the MCP response. Return plain data, ids and names.
- `ensureFontLoaded(fontName)` loads and caches a font before text edits.
- On failure the MCP response is an error containing the plugin's error message.

```json
{
  "code": "const frame = figma.createFrame();\nframe.name = 'Card';\nframe.resize(320, 200);\nfigma.currentPage.appendChild(frame);\nreturn { id: frame.id, name: frame.name };"
}
```

## `get_screenshot`

Exports a 2x PNG and returns it as an MCP image block.

| Input | Type | Required | Notes |
|---|---|---|---|
| `nodeId` | string | No | Node to capture |
| `name` | string | No | Node name to capture when no id is given |
| `file` | string | No | Required only when several plugins are connected |

Without `nodeId` or `name`, it captures the current selection, or the current page if nothing is selected. An explicit `nodeId` or `name` that does not resolve is an error; it never falls back to the page.

```json
{ "nodeId": "1:23" }
```

## `get_metadata`

Returns page metadata or a serialized node subtree.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | No | — | Node to inspect |
| `maxDepth` | number | No | `4` | Maximum depth of the returned tree |
| `file` | string | No | — | Required only when several plugins are connected |

Without `nodeId`, the current page is serialized. The payload includes ids, names, types, position, size, paints, auto-layout properties, text properties and children. Symbols and other non-serializable values are omitted. Serialization stops at 5,000 nodes.

```json
{ "nodeId": "1:23", "maxDepth": 3 }
```

## Return shapes

- `use_figma`: one text block containing the JSON-serialized return value.
- `get_screenshot`: one PNG image block.
- `get_metadata`: one text block containing JSON.

Errors are text blocks with `isError: true` and include a stable code such as `NO_PLUGIN`, `FILE_REQUIRED`, `FILE_NOT_FOUND` or `TIMEOUT`.
