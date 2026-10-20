# Setup

## Prerequisites

- Node.js 20 or newer.
- Figma Desktop.
- An MCP client that can launch a stdio server.

No Figma personal access token is required.

## 1. Install and build

```bash
npm ci
npm run build
```

`npm run build` runs `tsc` and writes `dist/`. Use `npm run typecheck` for the no-emit check.

## 2. Run the server

```bash
npm start          # tsx src/index.ts
# or
npm run start:dist # node dist/index.js
```

The server speaks MCP over stdin/stdout. Normally your MCP client launches it; running it in a terminal is only useful for checking that it boots. It logs the bridge port to stderr.

## 3. Pair the plugin

1. In Figma Desktop, open the target file.
2. Go to **Plugins → Development → Import plugin from manifest…** and select `plugin/manifest.json`.
3. Run **Plugins → Development → Local Figma Bridge**.
4. On first server start, read the token path printed in the server log, normally `~/.figma-bridge/token`:

   ```bash
   cat ~/.figma-bridge/token
   ```

5. Paste the token into the plugin's token field and press **Save**. The dot turns green when the WebSocket connects.
6. Keep the plugin window open.

The token is stored with mode `0600`. The server logs only its path. If you prefer to supply your own token, set `FIGMA_BRIDGE_TOKEN` for the server and enter the same value in the plugin.

## 4. Register with an MCP client

### Generic stdio config

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

### Claude Code

```bash
claude mcp add figma-bridge -- node <path-to-repo>/dist/index.js
```

### OpenCode

```json
{
  "mcp": {
    "figma-bridge": {
      "type": "local",
      "command": ["node", "<path-to-repo>/dist/index.js"],
      "enabled": true
    }
  }
}
```

Restart the client and confirm it lists exactly `use_figma`, `get_screenshot` and `get_metadata`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | No | `3000` | Loopback bridge port; the server tries the next ports if busy |
| `FIGMA_BRIDGE_TOKEN` | No | Random token in `~/.figma-bridge/token` | Shared secret between server and plugin |
| `FIGMA_COMMAND_TIMEOUT_MS` | No | `60000` | How long a tool waits for the plugin |

The server binds to `127.0.0.1` only.

## Install Figma's official `figma-use` skill

The skill is maintained by Figma and is not bundled with this repository. The `skillNames` input exists so clients that follow the skill do not fail schema validation; the value is ignored.

```bash
git clone --depth 1 https://github.com/figma/mcp-server-guide.git /tmp/figma-mcp
mkdir -p .agents/skills
cp -R /tmp/figma-mcp/skills/figma-use .agents/skills/
```

For Claude Code, copy into `.claude/skills/` instead. Restart the client and confirm `figma-use` appears in its skills list.

## Next steps

- [Bridge protocol](bridge.md)
- [Tools reference](tools.md)
- [Troubleshooting](troubleshooting.md)
