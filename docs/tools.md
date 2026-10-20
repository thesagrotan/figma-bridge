# Tools reference

The server exposes 16 MCP tools and one prompt against the file open in Figma Desktop. No tool uses the Figma cloud API or requires a Figma token.

If Figma's official server gains a capability that requires cloud services (Code Connect mappings, account libraries, file creation, AI generation), it is intentionally not registered here. See [official tool parity](official-tool-parity.md) for the full decision matrix.

## Multi-file routing

Each connected plugin window reports a `fileName` and `sessionId`. With one window, commands go to it automatically. With several windows, every tool accepts an optional `file` argument:

```json
{ "file": "Marketing site" }
```

`file` matches the exact `fileName` or `sessionId`. If it is missing or matches nothing, the tool returns an error listing the connected candidates. No file key or Figma URL is used.

## Canvas and inspection

### `use_figma`

Runs JavaScript in the Figma plugin sandbox with direct access to `figma.*`.

| Input | Type | Required | Notes |
|---|---|---|---|
| `code` | string | Yes | Plugin API code, up to 50,000 characters |
| `description` | string | No | Accepted for official-client compatibility; ignored |
| `skillNames` | string | No | Accepted for compatibility; ignored |
| `file` | string | No | Required only when several plugins are connected |

- Code runs inside an async wrapper, so top-level `await` and `return` work.
- Return plain JSON-serializable data (ids, names, dimensions), not whole node trees or base64.
- `ensureFontLoaded(fontName)` loads and caches a font before text edits.
- On failure the response is an error containing the plugin's message.

```json
{
  "code": "const frame = figma.createFrame();\nframe.name = 'Card';\nframe.resize(320, 200);\nfigma.currentPage.appendChild(frame);\nreturn { id: frame.id, name: frame.name };"
}
```

### `get_screenshot`

Exports a PNG and returns it as an MCP image block.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | No | — | Node to capture |
| `name` | string | No | — | Node name to capture when no id is given |
| `contentsOnly` | boolean | No | `false` | Render in isolation, excluding overlapping page content |
| `maxDimension` | integer | No | — | Cap the longer edge in pixels (max 65,536) |
| `enableBase64Response` | boolean | No | `true` | Accepted for compatibility; local responses are always inline |
| `file` | string | No | — | Required only when several plugins are connected |

Without `nodeId` or `name`, it captures the current selection, or the current page if nothing is selected. An explicit id or name that does not resolve is an error; it never falls back to the page. The local server does not produce temporary URLs.

```json
{ "nodeId": "1:23", "maxDimension": 1024 }
```

### `get_metadata`

Returns page metadata or a serialized node subtree.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | No | — | Node to inspect |
| `maxDepth` | number | No | `4` | Maximum depth of the returned tree |
| `maxNodes` | integer | No | `5000` | Maximum serialized nodes (max 20,000) |
| `format` | `json` \| `xml` | No | `json` | JSON preserves the original local behavior; XML emits an outline |
| `file` | string | No | — | Required only when several plugins are connected |

Without `nodeId`, the current selection is serialized, or the current page if nothing is selected. JSON includes ids, names, types, position, size, paints, auto-layout properties, text properties and children. Symbols and other non-serializable values are omitted.

```json
{ "nodeId": "1:23", "maxDepth": 3, "format": "xml" }
```

### `get_variable_defs`

Lists variables and styles used by a node, the selection, or the page.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | No | — | Subtree to inspect |
| `name` | string | No | — | Node name, when `nodeId` is omitted |
| `maxDepth` | integer | No | `8` | 0–20 |
| `maxNodes` | integer | No | `2000` | Up to 5,000 |
| `file` | string | No | — | Required only when several plugins are connected |

Returns name→value pairs plus definitions (id, key, type, description, collection, modes, scopes, code syntax, `usedBy`). Values are resolved for the consuming node and its selected modes where the Plugin API allows it. Remote variables that are not imported may only expose an alias id. Applied paint/text/effect/grid styles are returned separately.

### `get_design_context`

Returns a bounded, structured design tree. This is **not** Figma's proprietary React/Tailwind/iOS code generator.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` / `name` | string | No | current selection/page | Target node |
| `maxDepth` | integer | No | `6` | 0–20 |
| `maxNodes` | integer | No | `1500` | Up to 5,000 |
| `includeVariables` | boolean | No | `true` | Resolve variable bindings |
| `includeStyles` | boolean | No | `true` | Include applied style names and keys |
| `excludeScreenshot` | boolean | No | `false` | Omit the rendered PNG |
| `maxDimension` | integer | No | `1024` | Screenshot edge cap |
| `clientLanguages`, `clientFrameworks` | string | No | — | Informational only |
| `forceCode`, `disableCodeConnect` | boolean | No | — | Accepted for compatibility and reported as ignored |
| `skillNames` | string | No | — | Accepted for compatibility; ignored |
| `file` | string | No | — | Required only when several plugins are connected |

The result is labelled `local-structured` and includes node layout, paints, effects, typography, component metadata, variables/styles, a summary of colors/fonts/spacing/radii/effects/components, warnings, and an optional image block. Use the data to write code with the project's own components and tokens.

### `get_figjam`

Returns an XML outline of a FigJam board plus bounded node screenshots.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | No | selection/page | FigJam node |
| `maxDepth` | integer | No | `10` | 0–30 |
| `maxNodes` | integer | No | `2000` | Up to 5,000 |
| `includeImagesOfNodes` | boolean | No | `true` | Up to 6 PNGs, 512px edge, 4 MB total |
| `file` | string | No | — | Required only when several plugins are connected |

Only works when the open file is a FigJam board; Design and Slides files return `UNSUPPORTED_FILE`. FigJam-specific fields (sticky author, shape type, connector endpoints, table size, code language, widget id, media hash) are emitted on a best-effort basis.

### `get_motion_context`

Inspects keyframes, timelines, animation styles and manual tracks.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | No | selection/page | Animated node |
| `recursive` | boolean | No | `false` | Include animated descendants |
| `maxDepth` | integer | No | `10` | 0–20 |
| `maxNodes` | integer | No | `500` | Up to 2,000 |
| `clientLanguages`, `clientFrameworks` | string | No | — | Informational only |
| `file` | string | No | — | Required only when several plugins are connected |

Returns animation data plus CSS `@keyframes` and Motion snippets for supported fields. Animation styles are metadata and cannot be reproduced exactly. Spring easings are approximated with a cubic-bezier curve. The Motion API is beta and may be absent in older Figma builds.

### `export_video`

Exports a top-level animated frame or slide as MP4 through `node.exportAsync`.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | Yes | — | Top-level frame or slide that owns the timeline |
| `fps` | integer | No | `30` | 5–60; snapped to 12, 24, 30 or 60 by the Plugin API |
| `quality` | `low` \| `medium` \| `high` | No | `high` | MP4 quality preset |
| `constraint` | object | No | natural size | `{type:"SCALE",value}` (0.5/0.75/1/1.5/2/3/4) or `{type:"WIDTH"\|"HEIGHT",value}` (max 4096) |
| `outputDir` | string | No | `~/.figma-mcp-unchained/exports/<timestamp>` | Local destination |
| `inline` | boolean | No | `false` | Also return base64 in JSON |
| `file` | string | No | — | Required only when several plugins are connected |

The official server renders remotely and returns a temporary URL; this server writes an MP4 locally and caps the file at 100 MB. Nested layers and non-animated frames fail with `EXPORT_FAILED`.

## Assets

### `download_assets`

Exports renders, original image fills, and SVG assets from a node subtree.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `nodeId` | string | No | — | Single target |
| `nodeIds` | string[] | No | — | Up to 20 targets |
| `name` | string | No | — | Target name when no id is given |
| `defaultFormat` | `png` \| `jpg` \| `svg` \| `pdf` | No | node settings, else PNG | Export render format |
| `defaultScale` | number | No | node settings, else 1 | 0.01–4 |
| `includeRawImages` | boolean | No | `true` | Original image fills (up to 20) |
| `includeSvgAssets` | boolean | No | `true` | Vector-node SVG exports (up to 20) |
| `maxDimension` | integer | No | — | Cap raster export dimensions |
| `outputDir` | string | No | `~/.figma-mcp-unchained/downloads/<timestamp>` | Local destination |
| `inline` | boolean | No | `false` | Also include base64 in JSON |
| `file` | string | No | — | Required only when several plugins are connected |

The official server returns temporary URLs; this server writes files locally and returns their paths. Caps: 20 nodes, 20 raw images, 20 SVGs, 8 MB per export, 24 MB total per call. A truncated scan is reported in the response.

### `upload_assets`

Uploads images and SVGs into the open file.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `assets` | array | Yes | — | 1–60 items: `{name?, mimeType?, base64?, path?}` |
| `nodeIds` | string[] | No | — | One raster target per asset, same order |
| `nodeId` | string | No | — | Deprecated singular target for one asset |
| `parentId` | string | No | current page | Container for new layers |
| `x`, `y` | number | No | viewport center | Position for new layers |
| `scaleMode` | `FILL` \| `FIT` \| `TILE` | No | `FILL` | Raster fill mode |
| `currentPageId`, `batchCommit` | — | No | — | Accepted for compatibility; ignored |
| `file` | string | No | — | Required only when several plugins are connected |

Rasters become image fills on existing nodes or on new image-filled frames. SVGs become editable vector layers via `createNodeFromSvg` and ignore `nodeIds`. Supported types: PNG, JPEG, GIF, WebP, SVG. MIME type is sniffed when omitted. Caps: 10 MB per asset, 40 MB per call. The server reads local paths itself and sends bytes over the bridge; no upload URLs exist.

## Libraries and design system

### `get_libraries`

Lists design-system sources visible to the open file.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `includeVariables` | boolean | No | `false` | Read variable names for each enabled library collection |
| `maxCollections` | integer | No | `50` | Up to 200 |
| `offset` | integer | No | — | Accepted for compatibility; local results are not paginated |
| `file` | string | No | — | Required only when several plugins are connected |

Returns enabled library variable collections (grouped by library), local variable collections, local style/component counts, and style names. The Plugin API cannot enumerate subscribed component/style libraries or available Community/organization libraries.

### `search_design_system`

Searches local components, variables and styles plus library variables.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `queries` | array | Yes | — | 1–20 entries of `{entity: component\|variable\|style, query}` |
| `limit` | integer | No | `25` | Results per query, up to 100 |
| `includeLibraryVariables` | boolean | No | `true` | Include enabled library collections |
| `fileKey` | string | No | — | Accepted for compatibility; ignored |
| `disableCodeConnect` | boolean | No | — | Accepted for compatibility; ignored |
| `includeLibraryKeys` | string[] | No | — | Accepted for compatibility; ignored |
| `file` | string | No | — | Required only when several plugins are connected |

Results are returned in query order and use local exact/prefix/word/substring ranking. The Plugin API cannot enumerate or search library components/styles, so those results are limited to local assets.

## Shaders

### `list_shaders`

Lists shaders available to the open file via `figma.listAvailableShaders()`, including id, name, type, imported flag and property definitions. This is not the full account library, and source is not exposed.

Input: optional `file`.

### `get_shader`

Returns metadata and property definitions for one available shader.

| Input | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `file` | string | No |

Returns `SHADER_NOT_FOUND` for an unknown id. Shader source/GLSL, owner, description and version history are not available through the Plugin API.

### `list_file_shaders`

Lists shader effects and fills used in the file, with node usage and property values.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `allPages` | boolean | No | `false` | Scan every page instead of the current page |
| `maxNodes` | integer | No | `10000` | Up to 50,000 |
| `file` | string | No | — | Required only when several plugins are connected |

Source manifests are unavailable. Up to 100 shaders and 100 usage sites per shader are returned.

## FigJam diagrams

### `generate_diagram`

Creates a FigJam flowchart from a supported Mermaid subset.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | Yes | — | Diagram title |
| `mermaidSyntax` | string | Yes | — | Must start with `graph` or `flowchart` |
| `direction` | `LR` \| `RL` \| `TB` \| `BT` | No | source direction | Layout direction |
| `maxNodes` | integer | No | `100` | Up to 200 |
| `file` | string | No | — | Required only when several plugins are connected |

Supported: node ids, labels, shapes `[]`, `()`, `(())`, `{}`, `[()]`, `[[]]`, `>]`, `[/ /]`, and edges `-->`, `---`, `-.->`, `==>`, `~~~`, including `-->|label|`. Styling directives and other Mermaid diagram types are rejected with `UNSUPPORTED_DIAGRAM_TYPE`. Requires a FigJam file.

## Prompt

### `create_design_system_rules`

Registers an MCP prompt that asks the agent to inspect the target repository and produce a concrete Figma→code rules file covering stack/commands, component reuse, token mapping, layout, typography, assets, accessibility and verification.

Arguments: optional `clientLanguages`, `clientFrameworks`.

## Return shapes

- Canvas inspection tools return one text block with JSON, except `get_figjam` (XML text plus optional image blocks) and `get_screenshot` (one image block).
- `get_design_context` returns JSON text plus an optional image block.
- `download_assets` and `export_video` return JSON describing local files.
- Errors are text blocks with `isError: true` and include a stable code.

## Error codes

| Code | Meaning |
|---|---|
| `NO_PLUGIN` | No plugin is connected and none is polling |
| `FILE_REQUIRED`, `FILE_AMBIGUOUS`, `FILE_NOT_FOUND` | Multi-file routing problems |
| `TIMEOUT`, `PLUGIN_DISCONNECTED` | The plugin did not answer before the command expired |
| `NODE_NOT_FOUND` | An explicit node id or name does not resolve |
| `NO_SELECTION` | The command needs a target and no current page exists |
| `UNSUPPORTED_NODE` | The node cannot accept the requested operation (for example, a target without fills) |
| `UNSUPPORTED_FILE` | The open file type or Figma build does not support the operation |
| `INVALID_ARGUMENT`, `INVALID_ASSET`, `INVALID_ASSET_TARGETS`, `UNSUPPORTED_ASSET_TYPE` | Bad input or asset data |
| `ASSET_TOO_LARGE`, `ASSET_READ_FAILED`, `ASSET_WRITE_FAILED` | Local asset limits or filesystem failures |
| `LIBRARY_UNAVAILABLE` | The Figma build does not expose the required library API |
| `SHADER_NOT_FOUND` | Unknown shader id |
| `UNSUPPORTED_DIAGRAM_TYPE` | Unsupported Mermaid diagram type |
| `EXPORT_FAILED` | MP4 export rejected by Figma |
| `UNKNOWN_COMMAND` | The plugin received an unsupported command type |
