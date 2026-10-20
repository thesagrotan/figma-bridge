---
name: figma-mcp-unchained
description: >-
  Operating guide for figma-mcp-unchained, a local stdio MCP server that runs Figma
  Plugin API code in the Figma Desktop file where the bridge plugin is open.
  Use when the user wants to inspect or modify the open Figma file.
---

# figma-mcp-unchained

This server exposes exactly three tools against the file open in **Figma Desktop**:

| Tool | Use |
|---|---|
| `use_figma({ code })` | Run JavaScript against the Figma Plugin API. |
| `get_screenshot({ nodeId?, name? })` | Return a 2x PNG of a node, selection or page. |
| `get_metadata({ nodeId?, maxDepth? })` | Return selection/page metadata or a node subtree. |

## Prerequisites

1. The MCP client starts this server over stdio.
2. Figma Desktop is open with the target file.
3. **Plugins → Development → Figma MCP Unchained** is running and its window stays open.
4. The plugin's token matches the token in `~/.figma-mcp-unchained/token` (or `FIGMA_MCP_UNCHAINED_TOKEN`).

If the plugin is not connected, tools return a clear "no plugin connected" error. Start the plugin and retry.

## Working rules

- **Target the open file.** There is no file key or URL parameter. If several plugin windows are connected, pass the optional `file` argument with a `fileName` or `sessionId` returned by the routing error.
- **Call `get_metadata` first** when you need node ids or the current selection.
- **Load the official `figma-use` skill** before writing non-trivial `use_figma` code. This server does not bundle it.
- **Return JSON-serializable values** from `use_figma`. The result is serialized as JSON.
- **Use top-level `await` and `return`.** Code already runs inside an async wrapper.
- **Load fonts before touching text.** `ensureFontLoaded(fontName)` is available inside `use_figma`.
- **Verify writes** with `get_screenshot` and/or `get_metadata`.
- **This server cannot** create new files, search a design system, or read Figma's cloud API. Use Figma's official remote MCP server for those.
