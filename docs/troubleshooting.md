# Troubleshooting

## Server startup

### `FIGMA_PERSONAL_ACCESS_TOKEN is required`

`.env` is missing or empty. Copy `.env.example` to `.env` and set the token, or export
`FIGMA_PERSONAL_ACCESS_TOKEN` in the MCP client's `env` block.

### `Figma API 403` or `401` on reads

- The token is invalid, expired, or lacks file content read scope.
- Regenerate it under Figma → Settings → Security → Personal access tokens.
- If the client config omits `cwd`, the server may not find `.env`; pass the variables
  explicitly instead.

### Server does not appear in the MCP client

- Run `npm run build` to confirm the project type-checks.
- Make sure the client starts `npx tsx src/index.ts` from this repository (or with
  `cwd` set to it) and that `tsx` is installed (`npm install`).

## Bridge and editing

### `Timed out waiting for the Figma plugin` (60 s)

The command was queued but no plugin answered. Check:

1. The MCP server is running (it owns the bridge port).
2. The plugin window is open in the **desktop** app — the web browser is not supported.
3. The plugin shows `Waiting for MCP commands...`, not an error.
4. The bridge token matches: server `FIGMA_BRIDGE_TOKEN` vs. the field in the plugin
   window (both default to `local-development-token`).
5. `PORT` (default `3000`) matches the endpoint in `plugin/ui.html`.

### Plugin shows `Bridge returned 401`

Wrong or empty bridge token. Enter the same value as `FIGMA_BRIDGE_TOKEN`.

### Plugin shows `Bridge returned <code>` or a fetch error

The server is not reachable:

```bash
curl -H "X-Bridge-Token: local-development-token" http://127.0.0.1:3000/commands
```

- Connection refused → start the MCP server.
- `401` → token mismatch.
- `null` → bridge is healthy; the problem is elsewhere.

If you changed `PORT`, update both `plugin/ui.html` and
`networkAccess.allowedDomains` in `plugin/manifest.json`, then remove and re-import the
plugin manifest.

### Result: `"Parent node was not found"` or `"Node was not found"`

- `parentId` / `nodeId` does not exist in the open file, or the file changed since you
  read it. Re-read IDs with [`figma_get_file`](tools.md#figma_get_file) or
  [`figma_get_nodes`](tools.md#figma_get_nodes).
- Commands run against the file currently open in the desktop app — confirm you opened
  the intended file.

### Edit ran in the wrong file

There is no file targeting in the protocol; the plugin always edits the active file.
Close other files and keep only the target file open.

### Edits work but do not show up

Check you are looking at the current page. `create_frame` and `create_text` append to
the current page unless `parentId` points elsewhere.

## Reads

### Node IDs with `-` instead of `:`

Figma URLs use `node-id=1-2`; the API needs `1:2`. Replace the dash with a colon before
calling `figma_get_nodes` or `figma_render_nodes`.

### Rendered image URLs return 403/expired

Figma image URLs are short-lived. Download them as soon as the tool returns, and avoid
cache them.

### `figma_get_file` responses are huge

Pass `depth` (1–10) to limit the document tree, or use `figma_get_nodes` for specific
nodes.
