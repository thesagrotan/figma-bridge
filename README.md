# Figma Bridge

A Model Context Protocol server that lets AI agents read Figma designs and execute Plugin API code inside the open Figma Desktop file.

## Docs

- [Documentation index](docs/README.md)
- [Setup](docs/setup.md)
- [Tools reference](docs/tools.md)
- [Figma bridge](docs/bridge.md)
- [Troubleshooting](docs/troubleshooting.md)

## Setup

1. Create a Figma personal access token with read access.
2. Copy `.env.example` to `.env` and set `FIGMA_PERSONAL_ACCESS_TOKEN`.
3. Install dependencies and build:

```bash
npm install
npm run build
```

## Run

```bash
npm start
```

The server communicates over stdin/stdout and is intended to be launched by an MCP client. Do not add `.env` to source control.

## Tools

### REST read tools (Figma Cloud API)

- `figma_get_file`: retrieve file metadata and document tree
- `figma_get_nodes`: retrieve selected nodes by ID
- `figma_render_nodes`: retrieve rendered image URLs for selected nodes

Each tool accepts either a Figma file key or a Figma file/design URL.

### Canvas bridge tools (Local Plugin)

These tools require the local Figma Desktop plugin to be connected (see below).

- `use_figma`: execute arbitrary JavaScript natively via the Plugin API in the open document
- `get_screenshot`: export a 2x PNG of a node or the current page
- `get_metadata`: traverse the document node tree

## Enable the Canvas Bridge

The Figma REST API cannot read live canvas state (selection, viewport, variables). The local bridge runs user-supplied JavaScript directly inside the open file via a minimal Figma plugin.

1. Start the MCP server with `npm start`.
2. In Figma Desktop, open the target file.
3. Go to **Plugins → Development → Import plugin from manifest...** and select `plugin/manifest.json`.
4. Run **Plugins → Development → Local Figma Bridge**.
5. Leave the plugin window open while using the canvas bridge tools — it shows a green dot when connected.

The default bridge token is `local-development-token`. Set `FIGMA_BRIDGE_TOKEN` in `.env` and enter the same value in the plugin window to change it. The bridge listens only on `127.0.0.1`.
