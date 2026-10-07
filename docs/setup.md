# Setup

## Prerequisites

- Node.js 18+ (the server uses the global `fetch`)
- A Figma personal access token with **file content read** scope
  (Figma → Settings → Security → Personal access tokens)
- Figma desktop app, only if you want to use the editing bridge

## 1. Install

```bash
npm install
npm run build   # type-checks the project (tsc --noEmit)
```

## 2. Configure environment

Copy the example env file and fill in your token:

```bash
cp .env.example .env
```

```dotenv
PORT=3000
NODE_ENV=development
FIGMA_PERSONAL_ACCESS_TOKEN=figd_your_token_here
FIGMA_BRIDGE_TOKEN=local-development-token
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `FIGMA_PERSONAL_ACCESS_TOKEN` | Yes | — | Authenticates REST API reads |
| `FIGMA_BRIDGE_TOKEN` | No | `local-development-token` | Shared secret between server and plugin |
| `PORT` | No | `3000` | Local bridge HTTP port (binds to `127.0.0.1` only) |

The server throws `FIGMA_PERSONAL_ACCESS_TOKEN is required` on startup if the token is
missing. Never commit `.env`.

## 3. Run the server

```bash
npm start
```

This runs `tsx src/index.ts`. The server speaks MCP over stdin/stdout, so it is meant to
be launched by an MCP client rather than a terminal — leave it to your client to start.

## 4. Register with an MCP client

The server reads `.env` from its working directory, so set `cwd` to this repository.

**Claude Desktop / Claude Code (`claude mcp`)**

```json
{
  "mcpServers": {
    "figma-mcp": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/Users/daniel/Developer/figma-mcp",
      "env": {
        "FIGMA_PERSONAL_ACCESS_TOKEN": "figd_your_token_here"
      }
    }
  }
}
```

Or register directly:

```bash
claude mcp add figma-mcp \
  -e FIGMA_PERSONAL_ACCESS_TOKEN=figd_your_token_here \
  -- npx tsx src/index.ts
```

Restart the client, then confirm the four `figma_*` tools are listed.

## 5. Enable editing (optional)

Editing needs the local plugin — see [Figma Bridge](bridge.md).

## Next steps

- [Tools Reference](tools.md) — parameters and examples for every tool
- [Figma Bridge](bridge.md) — running edits against the open file
- [Troubleshooting](troubleshooting.md) — when something goes wrong
