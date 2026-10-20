# figma-mcp-unchained

**Figma's write-to-canvas, running on your machine.**


Give any MCP client the same canvas tools as Figma's official server, executed inside your open Figma Desktop file. No cloud hop, no Figma API token, no metering.


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
| `get_screenshot` | PNG of a node, your selection, or the page |
| `get_metadata` | Node tree and file info, as JSON or XML |
| `get_design_context` | Bounded structured design context for design-to-code work |
| `get_variable_defs` | Variables and styles used by a subtree, with resolved values |
| `get_figjam` | FigJam XML outline plus node images |
| `get_motion_context` | Keyframes, timelines, CSS and Motion snippets |
| `export_video` | MP4 export of a top-level animated frame or slide |
| `download_assets` | Renders, original images and SVG assets, written locally |
| `upload_assets` | Images and SVGs from base64 or local paths |
| `get_libraries` | Enabled library variable collections and local design-system assets |
| `search_design_system` | Search local components, variables and styles |
| `list_shaders`, `get_shader`, `list_file_shaders` | Shader metadata and usage |
| `generate_diagram` | Mermaid `graph`/`flowchart` → FigJam diagram |

It also exposes the `create_design_system_rules` prompt. Tools keep Figma's names where the capability exists locally, so its [`figma-use` skill](https://github.com/figma/mcp-server-guide) works for the canvas tools. See [tool parity](docs/official-tool-parity.md) for what is implemented, approximated and deliberately blocked.


## Quick start


1. **Register the server** with your MCP client:
   ```json
   { "mcpServers": { "figma-mcp-unchained": {
       "command": "npx", "args": ["tsx", "src/index.ts"], "cwd": "/path/to/figma-mcp-unchained"
   } } }
   ```
2. **Load the plugin:** Figma Desktop → Plugins → Development → Import plugin from manifest → `plugin/manifest.json`, then run **Figma MCP Unchained** and leave it open.
3. **Pair it:** paste the token from `~/.figma-mcp-unchained/token` into the plugin window. The dot turns green.
4. **Ask your agent to design.**


## Know before you run


- It executes arbitrary code in your file. Try it on a duplicate first.
- Figma Desktop and the plugin window must stay open. With several files open, pass `file` to pick one.
- stdio only, one MCP client per plugin session.
- Local tools cannot create files, query Code Connect mappings, search library components by name, or use Figma AI. `use_figma` can read your file's styles, variables and components plus enabled library variables, and import library components by key. Use Figma's official server for cloud-only capabilities.
- The plugin loads in Design, FigJam and Slides files. `get_figjam` and `generate_diagram` require FigJam; MP4 export requires a top-level animated frame or slide.
