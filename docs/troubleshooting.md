# Troubleshooting

## Server startup

### The server exits immediately

- Run `npm run typecheck` and `npm test` to confirm the checkout is healthy.
- Confirm your MCP client launches `node <path-to-repo>/dist/index.js` and that `dist/` exists (`npm run build`).
- The server is stdio-only. Do not start it as a background daemon; the MCP client must own stdin/stdout.

### The client does not list the tools

- Restart the MCP client after changing its config.
- Confirm the command path is absolute or the working directory is set.
- The server should list 16 tools and one prompt. If it lists only the original three, the MCP client is running an older build; rebuild and restart.

## Connection and token

### `no plugin connected`

No plugin window is connected and none is polling.

1. Open the target file in **Figma Desktop**.
2. Run **Plugins → Development → Figma MCP Unchained**.
3. Keep the plugin window open.
4. Check the dot: gray means waiting, green means connected, red means an error or bad token.

### 401 or a red dot

The plugin token does not match the server.

```bash
cat ~/.figma-mcp-unchained/token
```

Paste that value into the plugin and press **Save**. If you set `FIGMA_MCP_UNCHAINED_TOKEN`, use that value instead.

### `Host` rejected

The server accepts only `127.0.0.1` and `localhost` hosts. Use `http://127.0.0.1:<PORT>` or `http://localhost:<PORT>`; do not use a machine name or another interface.

### WebSocket origin rejected

A WebSocket upgrade with an `Origin` header is allowed only for `null` and loopback HTTP(S) origins. This is expected for the Figma plugin; a browser page on another origin is refused.

### Port already in use

The server tries the next 20 ports starting at `PORT` (default `3000`). The plugin scans `3000`–`3010` and `31337`. Check the server log for the actual port.

## Tool errors

### `Timed out waiting for the Figma plugin`

The plugin received no result in time (default 60 s).

- The command is removed from the queue and will not run later.
- If the document is busy or the code is slow, retry after the current operation finishes.
- Increase `FIGMA_COMMAND_TIMEOUT_MS` for intentionally long scripts.

### `FILE_REQUIRED` or `FILE_NOT_FOUND`

Several plugin windows are connected. Pass `file` with one of the `fileName` or `sessionId` values from the error message.

### `Node not found`

- The node may have been deleted or the file may have changed since `get_metadata`.
- Call `get_metadata` again and use the current id.
- Tool targets apply to the file open in the connected plugin window.

### The code ran in the wrong file

With several plugins connected, pass `file`. With one, close other plugin windows or switch Figma to the intended file.

### `use_figma` fails on text edits

Load the font first:

```js
await ensureFontLoaded({ family: "Inter", style: "Regular" });
```

### `UNSUPPORTED_FILE`

- `get_figjam` and `generate_diagram` need a FigJam board. Open a `.jam` file and run the plugin there.
- `export_video` and asset uploads need a Figma build that exposes the relevant Plugin API. Figma Desktop is required; browser Figma may lag.
- `upload_assets` SVG import needs `figma.createNodeFromSvg`; raster uploads need `figma.createImage`.

### `EXPORT_FAILED` on `export_video`

MP4 export only works for a top-level frame or slide with animated content. Select the frame that owns the timeline, not a nested layer. Older Figma builds may not support MP4 export at all.

### `LIBRARY_UNAVAILABLE` or empty library results

- `list_shaders` and shader metadata need a Figma build with the shader API.
- `get_libraries` and `search_design_system` can only see variable collections already enabled for the open file. The Plugin API cannot enumerate library components or styles.

### `ASSET_WRITE_FAILED` or no files appear

- Check the returned `outputDir`; the default is `~/.figma-mcp-unchained/downloads/<timestamp>` for assets and `~/.figma-mcp-unchained/exports/<timestamp>` for video.
- Pass `outputDir` to write somewhere else. The directory is created if missing.
- Downloads stop at the local size cap (24 MB assets, 100 MB video).

### Output is too large

- `get_metadata` stops at 5,000 nodes; lower `maxDepth`. `get_design_context` and `get_variable_defs` have their own caps.
- `use_figma` should return only the ids and values you need, not whole node trees or base64 data.
