---
name: figma-mcp-unchained
description: >-
  Operating guide for figma-mcp-unchained, a local stdio MCP server that runs Figma
  Plugin API code in the Figma Desktop file where the bridge plugin is open.
  Use when the user wants to inspect or modify the open Figma file, export
  screenshots/assets/video, inspect variables, styles, motion or shaders, or
  generate FigJam diagrams.
---

# figma-mcp-unchained

This server exposes 16 tools and one prompt against the file open in **Figma Desktop**. The plugin loads in Design, FigJam and Slides files.

| Tool | Use |
|---|---|
| `use_figma({ code })` | Run JavaScript against the Figma Plugin API. |
| `get_screenshot({ nodeId?, name?, contentsOnly?, maxDimension? })` | Return a PNG of a node, selection or page. |
| `get_metadata({ nodeId?, maxDepth?, maxNodes?, format? })` | Return JSON or XML node tree data. |
| `get_variable_defs({ nodeId?, name?, maxDepth?, maxNodes? })` | Resolve variables and styles used by a subtree. |
| `get_design_context({ nodeId?, includeVariables?, includeStyles?, excludeScreenshot?, maxDepth?, maxNodes?, maxDimension? })` | Structured design data plus an optional PNG. Not React/Tailwind codegen. |
| `get_figjam({ nodeId?, maxDepth?, maxNodes?, includeImagesOfNodes? })` | FigJam XML outline plus node images. FigJam only. |
| `get_motion_context({ nodeId?, recursive?, maxDepth?, maxNodes? })` | Keyframes, timelines, CSS and Motion snippets. |
| `export_video({ nodeId, fps?, quality?, constraint?, outputDir?, inline? })` | MP4 of a top-level animated frame or slide. |
| `download_assets({ nodeId?, nodeIds?, defaultFormat?, defaultScale?, includeRawImages?, includeSvgAssets?, outputDir?, inline? })` | Renders, original images and SVG assets, written locally. |
| `upload_assets({ assets, nodeIds?, parentId?, x?, y?, scaleMode? })` | Images/SVGs from base64 or local paths. |
| `get_libraries({ includeVariables?, maxCollections? })` | Enabled library variable collections and local design-system counts. |
| `search_design_system({ queries, limit?, includeLibraryVariables? })` | Search local components, variables and styles. |
| `list_shaders({})`, `get_shader({ id })`, `list_file_shaders({ allPages?, maxNodes? })` | Shader metadata and file usage. |
| `generate_diagram({ name, mermaidSyntax, direction?, maxNodes? })` | Mermaid `graph`/`flowchart` → FigJam shapes and connectors. |
| `create_design_system_rules` prompt | Generate a Figma→code rules template for the project. |

## Prerequisites

1. The MCP client starts this server over stdio.
2. Figma Desktop is open with the target file.
3. **Plugins → Development → Figma MCP Unchained** is running and its window stays open.
4. The plugin's token matches the token in `~/.figma-mcp-unchained/token` (or `FIGMA_MCP_UNCHAINED_TOKEN`).

If the plugin is not connected, tools return a clear `NO_PLUGIN` error. Start the plugin and retry.

## Working rules

- **Target the open file.** There is no file key or URL parameter. If several plugin windows are connected, pass the optional `file` argument with a `fileName` or `sessionId` returned by the routing error.
- **Call `get_metadata` first** when you need node ids or the current selection.
- **Load the official `figma-use` skill** before writing non-trivial `use_figma` code. This server does not bundle it.
- **Return JSON-serializable values** from `use_figma`. The result is serialized as JSON.
- **Use top-level `await` and `return`.** Code already runs inside an async wrapper.
- **Load fonts before touching text.** `ensureFontLoaded(fontName)` is available inside `use_figma`.
- **Verify writes** with `get_screenshot` and/or `get_metadata`.

## Choosing a read tool

- Use `get_design_context` for design-to-code: it includes layout, paints, typography, components, variable/style names, a summary and an optional screenshot. It is a local structured approximation, not Figma's proprietary code generator.
- Use `get_variable_defs` when the task is specifically about tokens, variables or applied styles.
- Use `get_motion_context` for animation data; it emits CSS/Motion snippets for supported fields.
- Use `get_figjam` only in FigJam; use `list_file_shaders` for shader usage in the current file.
- Use `get_libraries` / `search_design_system` for local design-system discovery, and read the `limitations` in the response: library components/styles cannot be enumerated.

## Assets and video

- `download_assets` and `export_video` write local files by default and return paths. Pass `outputDir` to choose a directory or `inline` to include base64. Local caps apply.
- `upload_assets` accepts `{ path }` for local files or `{ base64 }`; it sniffs MIME when omitted. Max 10 MB per asset, 60 assets per call.
- `export_video` only works on the top-level frame or slide that owns the timeline, not a nested layer.

## FigJam

`generate_diagram` supports only Mermaid `graph`/`flowchart` syntax and a documented subset of shapes and edges. Other Mermaid types return `UNSUPPORTED_DIAGRAM_TYPE`. It requires a FigJam file.

## What this server cannot do

- Create files, search account libraries by name, use Code Connect mappings, import local projects into Figma Make, capture live web pages, or use Figma AI.
- Return temporary cloud URLs; all assets are delivered as local files or inline base64.
- Use the Figma REST API or a Figma token. Everything runs through the Plugin API in the open file.
