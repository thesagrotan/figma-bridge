# figma-bridge Documentation

A Model Context Protocol (MCP) server that exposes Figma cloud read tools over the REST API and live document manipulation through a local Figma desktop plugin bridge.

## Contents

| Guide | Description |
|---|---|
| [Setup](setup.md) | Install, configure the token, register the server with an MCP client |
| [Tools Reference](tools.md) | Every MCP tool, its inputs and example payloads |
| [Figma Bridge](bridge.md) | How to use the bridge for live canvas operations and protocol details |
| [Troubleshooting](troubleshooting.md) | Common errors and how to fix them |

## Quick Start

```bash
npm install
cp .env.example .env   # add your FIGMA_PERSONAL_ACCESS_TOKEN
npm start
```

Then register the server with your MCP client (see [Setup](setup.md)).

For live canvas operations, also install and run the local plugin in Figma Desktop (see [Figma Bridge](bridge.md)).

## Architecture

```mermaid
flowchart LR
    Client[MCP client] <-->|stdio| Server[src/index.ts<br/>MCP server]
    Server -->|REST API| Figma[Figma Cloud REST API]
    Server <-->|WebSocket ws://localhost:3000| Plugin[plugin/ui.html<br/>Bridge UI]
    Plugin <-->|postMessage| Code[plugin/code.js<br/>Sandbox]
    Code <-->|Plugin API| Canvas[Figma Canvas]
```

- **Cloud REST Reads** (`figma_get_file`, `figma_get_nodes`, `figma_render_nodes`, `figma_get_styles`, etc.) communicate with the Figma REST API.
- **Canvas Bridge Operations** (`use_figma`, `get_screenshot`, `get_metadata`) run directly against the active file open in the Figma Desktop app in real time with zero rate limits.
