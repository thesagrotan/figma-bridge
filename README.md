# figma-mcp-unchained

**Figma's write-to-canvas, running on your machine.**


Give any MCP client the same canvas tools as Figma's official server, executed inside your open Figma Desktop file. No cloud hop, no Figma API token, no metering.

**Requires:** Node.js 20+, Figma Desktop, and an MCP client that can launch stdio servers. Run `npm install` after cloning.


## Why


| | Figma's official remote MCP | figma-mcp-unchained |
|---|---|---|
| **Where it runs** | Remote only. `use_figma` isn't on Figma's desktop server | Local, inside Figma Desktop |
| **Plan gate** | Paid plan + edit access; beta, usage pricing planned | None from MCP* |
| **Screenshot & metadata calls** | Metered: 200/day (Pro, Org), 600/day (Enterprise), 10-20/min | Unmetered |
| **Output per call** | ~20 KB | Whatever your script returns |
| **Clients** | Allowlisted clients only | Any stdio MCP client |
| **Targeting** | File or selection link | Your open file + live selection |
| **Credentials** | Figma OAuth | Local token, no Figma API token |


<sub>Official figures as of Oct 2026; Figma can change them. *You still need edit access to the file you're changing.</sub>


## Tools


| Tool | What it does |
|---|---|
| `use_figma` | Run Plugin API JavaScript in the open file (top-level `await`, `return` data back) |
| `get_screenshot` | 2x PNG of a node, your selection, or the page |
| `get_metadata` | Node tree and file info |


Same names as Figma's server, so its [`figma-use` skill](https://github.com/figma/mcp-server-guide) works as-is.


## Quick start


1. **Register the server** with your MCP client:
   ```json
   { "mcpServers": { "figma-mcp-unchained": {
       "command": "npx", "args": ["tsx", "src/index.ts"], "cwd": "/path/to/figma-mcp-unchained"
   } } }
   ```
2. **Load the plugin:** Figma Desktop → Plugins → Development → Import plugin from manifest → `plugin/manifest.json`, then run **Figma MCP Unchained** and leave it open.
3. **Pair it:** paste the token from `~/.figma-mcp-unchained/token` into the plugin window and press **Save**. The dot turns green.
4. **Ask your agent to design.**


## Know before you run


- It executes arbitrary code in your file. Try it on a duplicate first.
- The bridge is loopback-only; every command route requires the local token.
- Commands are in memory: restarting the server drops pending work.
- Figma Desktop and the plugin window must stay open. With several files open, pass `file` to pick one.
- stdio only, one MCP client per plugin session.
- No file creation, code-to-canvas or library-wide search. `use_figma` can read your file's styles, variables and components plus library variables, and import library components by key, but it can't search libraries by name. Use Figma's server for those.


## Docs


[Setup](docs/setup.md) · [Bridge protocol](docs/bridge.md) · [Tools](docs/tools.md) · [Troubleshooting](docs/troubleshooting.md)
