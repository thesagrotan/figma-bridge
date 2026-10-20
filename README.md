# figma-bridge

A local stdio MCP server that exposes Figma's write-to-canvas tool surface against the file currently open in **Figma Desktop**:

- `use_figma` — run JavaScript through the Figma Plugin API.
- `get_screenshot` — capture a 2x PNG of a node, selection or page.
- `get_metadata` — inspect the current page or a node subtree.

It talks to a small Figma Desktop plugin over loopback WebSocket (with an HTTP polling fallback). There is **no Figma API token**, no cloud API call, and no Figma plan/seat check from an MCP server. It works with any MCP client that can launch a stdio server.

## How it differs from Figma's official remote MCP server

| | figma-bridge (this project) | Figma official remote MCP |
|---|---|---|
| Runs | Locally, over stdio | Hosted, over HTTP |
| Target | File open in Figma Desktop with the plugin running | File key / Figma link |
| Reads | Local plugin, unmetered | Metered by plan/seat |
| Plan gate | None from Figma's MCP | Eligible Figma plan/seat required |
| Tools | `use_figma`, `get_screenshot`, `get_metadata` | Broader catalog, including `create_new_file` and design-system search |
| Cloud file access | No | Yes |

Use the official remote server when you need cloud reads, link targeting, new-file creation or design-system search. Use this bridge when you want the official write-to-canvas surface without a token, cloud calls or Figma's MCP usage limits.

## Requirements

- Node.js 20 or newer.
- Figma Desktop (the browser and mobile apps are not supported).
- An MCP client that can launch a stdio server.

## Setup

```bash
npm ci
npm run build
```

`npm run build` emits JavaScript into `dist/`. `npm run typecheck` is the no-emit check.

Register the server with your MCP client. No environment variables are required:

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "node",
      "args": ["<path-to-repo>/dist/index.js"]
    }
  }
}
```

Then install the plugin:

1. In Figma Desktop, open the target file.
2. Go to **Plugins → Development → Import plugin from manifest…** and select `plugin/manifest.json`.
3. Run **Plugins → Development → Local Figma Bridge**.
4. Leave the plugin window open while using the tools.

See [Setup](docs/setup.md) for client-specific configuration.

## Token pairing

The bridge binds to `127.0.0.1` and requires a shared token. On first start, if `FIGMA_BRIDGE_TOKEN` is unset, the server generates a random 32-byte token and writes it to `~/.figma-bridge/token` (mode `0600`). The log prints the path, never the token.

Open the plugin window, paste the token into the token field and press **Save**. The plugin stores it and reconnects. To use your own token, set `FIGMA_BRIDGE_TOKEN` in the server environment and enter the same value in the plugin.

## Tools

| Tool | Inputs | Returns |
|---|---|---|
| `use_figma` | `code`, optional `skillNames` (accepted and ignored) | JSON-serialized return value, or an error |
| `get_screenshot` | optional `nodeId`, optional `name` | 2x PNG image block |
| `get_metadata` | optional `nodeId`, optional `maxDepth` (default 4) | Page metadata or node subtree JSON |

Windows that are connected report a file name and session id. If more than one plugin is connected, all three tools also accept an optional `file` argument matching either value; without it they return an error listing the candidates.

`use_figma` runs inside an async wrapper, so top-level `await` and `return` work. `ensureFontLoaded(fontName)` is available. The returned value must be JSON-serializable.

## The official `figma-use` skill

Figma's `figma-use` skill contains the rules for writing safe Plugin API code. It is not bundled here. Install it from Figma's official repository:

```bash
git clone --depth 1 https://github.com/figma/mcp-server-guide.git /tmp/figma-mcp
mkdir -p .agents/skills
cp -R /tmp/figma-mcp/skills/figma-use .agents/skills/
```

Use `.claude/skills/` instead for Claude Code, or the equivalent skills directory for your client. See [Setup](docs/setup.md#install-figmas-official-figma-use-skill).

## Security

- The HTTP and WebSocket servers accept only `127.0.0.1` / `localhost` `Host` headers.
- WebSocket upgrades reject a present `Origin` that is neither `null` nor loopback.
- Every command route requires the bridge token. `/health` is the only unauthenticated route.
- Commands that have no connected plugin fail immediately; timed-out commands are removed from the queue and late results are dropped.
- `use_figma` executes arbitrary JavaScript inside Figma. Treat the token like a local credential and do not expose the port.

## Limitations

- Figma Desktop and the plugin window must stay open.
- One MCP client per plugin session; stdio only.
- No `create_new_file`, design-system search, cloud REST reads or link targeting. For those, use Figma's official MCP server.
- The server only works with the file(s) whose plugin window is open. With several windows, pass `file`.
- Commands are in memory; restarting the server discards anything pending.

## Docs

- [Setup](docs/setup.md)
- [Bridge protocol](docs/bridge.md)
- [Tools reference](docs/tools.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Documentation index](docs/README.md)

## Test

```bash
npm run typecheck
npm test
```
