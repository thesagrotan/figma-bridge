# Figma Bridge

A Model Context Protocol server that exposes Figma read tools over stdio and controlled edits through a local Figma plugin bridge.

## Docs

- [Documentation index](docs/README.md)
- [Setup](docs/setup.md)
- [Tools reference](docs/tools.md)
- [Figma bridge](docs/bridge.md)
- [Troubleshooting](docs/troubleshooting.md)

## Setup

1. Create a Figma personal access token with read access.
2. Copy `.env.example` to `.env` and set `FIGMA_PERSONAL_ACCESS_TOKEN`.
3. Install dependencies and validate the project:

```bash
npm install
npm run build
```

## Run

```bash
npm start
```

The server communicates over stdin/stdout, so it is intended to be launched by an MCP client. Do not add `.env` to source control.

## Tools

- `figma_get_file`: retrieve file metadata and its document tree
- `figma_get_nodes`: retrieve selected nodes
- `figma_render_nodes`: retrieve rendered image URLs for selected nodes
- `figma_edit`: create frames/text, update nodes, or delete nodes through the plugin bridge

Each tool accepts either a Figma file key or a Figma file/design URL.

## Enable Editing

The Figma REST API cannot edit arbitrary design nodes. The included plugin executes edits inside the open Figma file.

1. Start the MCP server with `npm start`.
2. In Figma desktop, open the target file.
3. Go to **Plugins > Development > Import plugin from manifest...** and select `plugin/manifest.json`.
4. Run **Plugins > Development > Local Figma Bridge**.
5. Leave the plugin window open while using the `figma_edit` MCP tool.

The default bridge token is `local-development-token`. Set `FIGMA_BRIDGE_TOKEN` in `.env` and enter the same value in the plugin window if you change it. The bridge listens only on `127.0.0.1`.

Example `figma_edit` payloads:

```json
{
  "type": "create_frame",
  "payload": { "name": "Dashboard", "width": 1440, "height": 900, "x": 100, "y": 100 }
}
```

```json
{
  "type": "create_text",
  "payload": { "characters": "Hello from MCP", "fontSize": 32, "x": 120, "y": 140 }
}
```

For `update_node`, provide `nodeId` and any of `name`, `characters`, `x`, `y`, `width`, or `height`. For `delete_node`, provide `nodeId`.
