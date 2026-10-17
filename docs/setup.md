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

### AI provider (optional)

PARALLEL does **not** need an AI provider. The demo and all deterministic
directions work with the variables above; briefs are handled by the built-in
keyword parser. Configure a provider only if you want model-assisted
interpretation of written briefs and reference images:

```dotenv
PARALLEL_AI_PROVIDER=openai
PARALLEL_AI_API_KEY=sk_your_key_here
# OPENAI_API_KEY=sk_your_key_here   # accepted as a fallback for the key
PARALLEL_AI_BASE_URL=https://api.openai.com/v1
PARALLEL_AI_MODEL=gpt-4o-mini
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PARALLEL_AI_PROVIDER` | No | `none` | Enables model interpretation when non-empty and not `none` |
| `PARALLEL_AI_API_KEY` | No | — | Provider key (required when a provider is set); falls back to `OPENAI_API_KEY` |
| `PARALLEL_AI_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `PARALLEL_AI_MODEL` | No | `gpt-4o-mini` | Model name sent to `/chat/completions` |

The model is only asked to choose from PARALLEL's recipe whitelist; it cannot
emit code or node ids, and it never touches the Figma document. If the provider
is unset, misconfigured or returns unusable output, PARALLEL falls back to the
deterministic parser and reports that in the brief.

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
    "figma-bridge": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/Users/daniel/Developer/figma-bridge",
      "env": {
        "FIGMA_PERSONAL_ACCESS_TOKEN": "figd_your_token_here"
      }
    }
  }
}
```

Or register directly:

```bash
claude mcp add figma-bridge \
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
