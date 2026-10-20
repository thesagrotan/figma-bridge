# Official Figma MCP tool parity

This document compares the tools exposed by Figma's official MCP server with
`figma-mcp-unchained`. It is the source of truth for what this project implements,
approximates, and refuses to fake.

## Research basis

- Official docs: <https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/>
- Official server setup: <https://developers.figma.com/docs/figma-mcp-server/>
- Help center: <https://help.figma.com/hc/en-us/articles/39216419318551-Get-started-with-the-Figma-MCP-server>
- Plugin API typings: `@figma/plugin-typings@1.142.0` (inspected, not vendored)
- Official tool JSON schemas were cross-checked against a cached public tool
  catalog and the documented parameter tables. Where Figma has changed a schema
  recently, this document follows the current docs and notes the divergence.

The cached connector catalog used for this review also contains three connector-internal tools
(`authorize_mcp_app`, `report_mcp_app_failure`, `open_figma_mcp_app_in_thread`). They are
plumbing for the hosted Figma app, not user-facing Figma MCP tools, and are excluded from the
matrix below.

## Decision key

| Decision | Meaning |
|---|---|
| `IMPLEMENT_FULL` | The local tool covers the documented semantics through the Plugin API in the open file. Local-only differences (no `fileKey`, no cloud URLs) are documented. |
| `IMPLEMENT_PARTIAL` | The local tool is useful and honest, but it cannot match the official output because the Plugin API lacks the required data or codegen service. The response is labelled and limitations are returned with the data. |
| `BLOCKED` | The capability requires a cloud/account API, Dev Mode/Code Connect services, Figma AI, or a file-creation API that plugins do not have. No placeholder tool is registered. |

`fileKey` is the recurring blocker. This server has no Figma API token and no
cloud calls; commands run against the file open in the connected Figma Desktop
plugin. For local tools, `nodeId` is optional and defaults to the live selection
or current page. Passing a `fileKey` is not required and is not accepted.

## Read tools

| Tool | Official behavior | Inputs | Output | Official availability | Local feasibility | Approach | Limitations | Decision |
|---|---|---|---|---|---|---|---|---|
| `download_assets` | Exports a node (PNG/JPG/SVG/PDF) plus original source images and vector SVGs; returns temporary URLs. Up to 20 nodes, 20 raw images, 20 SVG assets. | `fileKey`, `nodeId` (current docs allow up to 20 nodes), `defaultFormat`, `defaultScale` 0.01–4 | `export`, `rawImages`, `svgAssets`, `rawImagesTruncated`; temporary URLs | Remote only | Yes, with local file delivery | `exportAsync` for renders, `getImageByHash().getBytesAsync()` for raw fills, vector-node SVG export; server writes files to a local directory by default | No temporary public URLs. Returns local file paths (or inline base64). Total/count/size caps are local. Export settings are read from the node when no `defaultFormat`/`defaultScale` is given. | `IMPLEMENT_FULL` |
| `get_code_connect_map` | Returns Code Connect mappings for selected instances (`componentName`, `source`, snippets, label). | `nodeId`, `fileKey`, optional `codeConnectLabel` | Map keyed by node id | Desktop + remote | No | None | The Plugin API exposes no Code Connect mapping API. Dev Mode `figma.codegen` cannot read mappings either. Unblocked by a documented Dev Mode/Code Connect plugin API or an official local endpoint. | `BLOCKED` |
| `get_code_connect_suggestions` | Figma-prompted AI suggestions for mapping components to code. | `nodeId`, `fileKey`, `excludeMappingPrompt` | Suggestions + thumbnails | Desktop + remote | No | None | Requires Figma's suggestion service and Code Connect backend. | `BLOCKED` |
| `get_context_for_code_connect` | Component property, variant, and descendant metadata for authoring Code Connect templates. | `nodeId`, `fileKey` | Property definitions + descendant tree | Remote only | Partial metadata is possible, but the tool's contract is Code Connect-specific | Not registered under this name; `get_design_context` exposes the same component properties/variants for local authoring | No Code Connect template semantics, parserless metadata, or mapping context. | `BLOCKED` |
| `list_file_components_for_code_connect` | Lists every component/component set published to a file's library with properties, instance counts and a cross-library dependency graph. | `fileKey` | Flat component graph | Remote only | Partial metadata is possible, but the contract is Code Connect-specific | Not registered under this name; `get_design_context` and `use_figma` expose local component properties, variants and instances | The Plugin API can read component properties and publish status, but cannot determine library membership or reliable cross-library dependency flags for every published asset. A local graph would be incomplete and misleading for Code Connect planning. | `BLOCKED` |
| `get_design_context` | Primary design-to-code tool. Returns React/Tailwind (or requested framework) code, asset URLs, and a screenshot. | `nodeId`, `fileKey`, `clientLanguages`, `clientFrameworks`, `forceCode`, `disableCodeConnect`, `skillNames`, `excludeScreenshot` | Reference code + assets + screenshot | Desktop + remote | Partial | Returns a structured, bounded design tree with computed layout, paints, typography, component metadata, variable/style references, a summary, and an optional screenshot. Explicitly labelled `local-structured`, not codegen. | No proprietary React/Tailwind/iOS code generation, no Code Connect component substitution, no asset URL service. `forceCode` cannot force the proprietary generator. Consumers must generate code from the structured data. | `IMPLEMENT_PARTIAL` |
| `get_figjam` | XML outline of a FigJam diagram plus node images. | `nodeId` (default `0:1`), `fileKey`, `includeImagesOfNodes` (default true) | XML + images | Desktop + remote | Yes, when the open file is FigJam | Traverses FigJam node types (sticky, shape, connector, section, table, code block, embed, link unfurl, media, widget) and emits XML plus bounded screenshots | Figma Design/Slides return `UNSUPPORTED_FILE`. Image count/size is capped locally. FigJam-only node fields are emitted on a best-effort basis. | `IMPLEMENT_FULL` |
| `get_generative_plugin` | Reads a generative plugin's source manifest/files from the account library. | `id`, `version`, `includeSource` | Manifest + file URIs/source | Remote only | No | None | No account-library, plugin-source, build, or MCP resource API exists in the Plugin API. | `BLOCKED` |
| `get_libraries` | Lists libraries added to a file and libraries available to add. | `fileKey`, `offset` | Two library lists with keys/descriptions/sources | Remote only | Partial | Lists enabled library variable collections via `figma.teamLibrary`, local variable collections, and local style/component counts | The Plugin API cannot enumerate subscribed component/style libraries or available Community/organization libraries. Only variable collections from already-enabled libraries are visible. | `IMPLEMENT_PARTIAL` |
| `mentionable_files` | Searches the signed-in user's accessible Design, FigJam and Make files; empty query returns recent files. | `query` | File list | Remote only | No | None | Account-wide file search requires Figma cloud access; the Plugin API only sees the open file. | `BLOCKED` |
| `get_metadata` | Lightweight XML outline; without `nodeId` returns top-level pages. | `fileKey`, optional `nodeId` | XML outline | Desktop + remote | Yes, plus existing JSON mode | Existing JSON tree remains the default. New `format: "xml"` emits an XML outline. Existing selection/page fallback is preserved. | XML element shape is local, not byte-for-byte official. Without `nodeId` the existing JSON behavior (selection/page) is preserved instead of the official page list, to avoid a breaking change. | `IMPLEMENT_FULL` |
| `export_video` | Renders a timeline node as MP4 server-side and returns a presigned URL plus `jobId` polling. | `fileKey`, `nodeId` or `jobId`, `fps` 5–60, `quality`, `constraint`, `ttlSeconds` | MP4 URL / processing job | Desktop + remote | Yes, through `node.exportAsync({ format: "MP4" })` | Exports the top-level animated frame or slide through the Plugin API and writes the MP4 to a local directory | No server-side render farm, job polling, temporary URL or TTL. `fps` is snapped to the Plugin API's supported 12/24/30/60. The node must be a top-level frame/slide with animation. Local 100 MB cap. | `IMPLEMENT_FULL` |
| `get_motion_context` | Animation inventory, keyframe tracks, easing, CSS `@keyframes`, and Motion snippets. | `nodeId`, `fileKey`, `recursive`, `clientLanguages`, `clientFrameworks` | Motion data + code snippets | Desktop + remote | Partial | Reads `node.animations`, `animationStyles`, `manualKeyframeTracks`, `timelines`, and custom animation styles. Generates CSS keyframes and Motion snippets for supported manual tracks. | Figma animation styles cannot be converted exactly; they are returned as metadata. Only supported keyframe fields get CSS snippets. Motion API is Beta and may be absent in older desktop builds. | `IMPLEMENT_PARTIAL` |
| `get_screenshot` | PNG of a node, with `maxDimension` and isolated rendering. | `nodeId`, `fileKey`, `contentsOnly`, `enableBase64Response`, `maxDimension` | PNG URL and/or inline base64 + dimensions | Desktop + remote | Yes | Existing 2x PNG behavior is unchanged. New optional `contentsOnly` and `maxDimension` map to `exportAsync`. | Local server returns inline PNG (no temporary URL). | `IMPLEMENT_FULL` |
| `get_shader` | Reads a shader's source manifest/files from the account library. | `id`, `version`, `includeSource` | Name/description/owner/type/version + source files | Desktop + remote | Partial metadata only | Returns shader metadata and property definitions from `figma.listAvailableShaders()` for the open file | No shader source/GLSL, version history, owner/account data, or file manifests. Source is not exposed by the Plugin API. | `IMPLEMENT_PARTIAL` |
| `get_variable_defs` | Variables and styles used in a node, with resolved values. | `nodeId`, `fileKey` | Variable/style names and values | Desktop + remote | Yes | Collects `boundVariables` (node fields, paints, strokes, effects, layout grids), applied styles, resolves aliases per consumer and mode, and returns name→value plus definitions | Remote variables may only resolve to an alias without an imported definition. Output is capped. | `IMPLEMENT_FULL` |
| `list_file_shaders` | Lists shader effects/fills used in a file with source manifests. | `fileKey` | Up to 100 shaders + source files | Remote only | Partial | Scans nodes for `SHADER` paints/effects and returns ids, names, property values, metadata, and usage | No source files or version manifests. Current-page scan by default; all-pages scan is opt-in and bounded. | `IMPLEMENT_PARTIAL` |
| `list_generative_plugins` | Lists generative plugins in the account library. | `cursor` | Plugin list + cursor | Remote only | No | None | No account-library API in the Plugin API. | `BLOCKED` |
| `list_shaders` | Lists shader effects/fills in the account library. | `cursor` | Shader list + cursor | Desktop + remote | Partial | `figma.listAvailableShaders()` returns shaders available to the open file | This is the file's available set, not the full account library. No owner, description, version, or cursor. | `IMPLEMENT_PARTIAL` |
| `search_design_system` | Searches all connected libraries for components, variables, and styles. | `queries` (array of `{entity, query}`), `fileKey`, `disableCodeConnect`, `includeLibraryKeys` | Results in query order | Remote only | Partial | Searches local components/component sets, local variables, local styles, and variables in enabled library collections | The Plugin API cannot enumerate or search library components/styles. Library variables are limited to enabled collections. Ranking is local substring/prefix scoring, not the official search service. | `IMPLEMENT_PARTIAL` |
| `generate_deck` | Generates up to three editable Figma Slides decks from a structured outline, theme and template query. | `title`, `description`, `objectives`, `rules`, `outline`, `templateQuery`, `theme` | Deck URLs + thumbnails | Remote only | No | None | Requires Figma's AI deck-generation service and Slides creation; the Plugin API can edit an open deck but cannot generate one. | `BLOCKED` |
| `whoami` | Account email, plans, and seats. | None | Identity + plans | Remote only | No | None | `figma.currentUser` (with permission) exposes only id/name/photo/color; no email, plans, or seats. Not a meaningful approximation. | `BLOCKED` |

## Write tools

| Tool | Official behavior | Inputs | Output | Official availability | Local feasibility | Approach | Limitations | Decision |
|---|---|---|---|---|---|---|---|---|
| `add_code_connect_map` | Maps a published Figma component to a code component. | `nodeId`, `fileKey`, `source`, `componentName`, `label`, `template`, `templateDataJson` | Saved mapping | Desktop + remote | No | None | No Code Connect write API in the Plugin API. | `BLOCKED` |
| `create_generative_plugin` | Creates a generative plugin starter in the account library. | `name`, `description`, `planKey` | Plugin id | Remote only | No | None | Requires account library + build service + plan keys. | `BLOCKED` |
| `create_new_file` | Creates a blank Design/FigJam/Slides file in drafts. | `fileName`, `planKey`, `editorType`, `projectId` | File key + URL | Remote only | No | None | Plugins cannot create files or access drafts/projects. | `BLOCKED` |
| `create_shader` | Creates a shader effect/fill starter in the account library. | `name`, `description`, `planKey`, `kind` | Shader id | Remote only | No | None | Requires account library + shader build service. | `BLOCKED` |
| `generate_diagram` | Generates a FigJam diagram from Mermaid (flowchart, sequence, state, gantt, ERD). | `name`, `mermaidSyntax`, `userIntent`, `planKey`, `savePlanKey`, `useArchitectureLayoutCode`, `fileKey` | FigJam nodes | Remote only | Partial | Parses a documented subset of Mermaid `graph`/`flowchart` syntax and creates FigJam shapes + connectors | Only flowchart/graph subset; no sequence, state, gantt, ERD, architecture layout, or styling/class directives. Returns `UNSUPPORTED_DIAGRAM_TYPE` for other diagram types. | `IMPLEMENT_PARTIAL` |
| `generate_figma_design` | Captures a live web page into an existing Design file. | `fileKey`, `nodeId`, `captureId` | Captured layers | Remote only | No | None | Needs Figma's capture service/browser infrastructure. The Plugin API cannot capture live web pages. | `BLOCKED` |
| `generate_image` | Generates an image from a prompt using Figma AI credits. | Prompt + dimensions + plan selector | Image URL | Remote only | No | None | Requires Figma AI model access and credits. | `BLOCKED` |
| `html_to_figma` | Converts self-contained HTML into plain Design layers. | HTML document, file/target, element selector | Layers | Remote only | No | None | Requires an HTML/CSS layout and paint engine. A regex-based converter would silently misrender real documents, so it is not shipped. Unblocked by a local headless browser renderer or an official conversion service. | `BLOCKED` |
| `send_code_to_figma` | Imports a local project as a Figma Make file or code layer. | Project archive + target | Make file/code layer | Remote only | No | None | Requires Figma Make/code-layer upload and build services. | `BLOCKED` |
| `send_code_connect_mappings` | Saves multiple approved Code Connect mappings. | `nodeId`, `fileKey`, `mappings`, `clientLanguages`, `clientFrameworks` | Per-mapping result | Desktop + remote | No | None | Same missing Code Connect write API as `add_code_connect_map`. | `BLOCKED` |
| `update_generative_plugin` | Replaces generative plugin files; Figma builds/deploys. | `id`, `commitMessage`, `files`, `metadata` | New version | Remote only | No | None | Requires account library + build/deploy service. | `BLOCKED` |
| `update_shader` | Replaces shader source; Figma builds/deploys. | `id`, `commitMessage`, `kind`, `files`, `metadata` | New version | Remote only | No | None | Requires account library + shader build service. | `BLOCKED` |
| `upload_assets` | Uploads images/SVGs (≤10 MB each, ≤60/call) and places them as fills or vector layers. | `fileKey`, `count`, `currentPageId`, `nodeIds`, `scaleMode`, `batchCommit` | Upload URLs + placement | Remote only | Yes, with local bytes | Accepts base64 assets or local file paths; `createImage` for rasters, `createNodeFromSvg` for SVGs, optional fill targets; creates frames/shapes when no target is given | No single-use upload URLs or `batchCommit`; server reads bytes locally and sends them through the bridge. Local total-size cap. SVG target nodes are ignored like the official tool. | `IMPLEMENT_FULL` |
| `use_figma` | General-purpose Plugin API writer. | `fileKey`, `code` (≤50k), `description` (≤2k), `skillNames` | Script result | Remote only | Yes | Existing local implementation | No `fileKey`; targets the open file/selection. `description` is accepted and ignored for client compatibility. | `IMPLEMENT_FULL` |

## MCP prompt

| Prompt | Official behavior | Inputs | Output | Official availability | Local feasibility | Approach | Limitations | Decision |
|---|---|---|---|---|---|---|---|---|
| `create_design_system_rules` | Generates a rules file that tells an agent how to turn designs into code for the project's stack and design system. | `clientLanguages`, `clientFrameworks` | Prompt message with rules guidance | Desktop + remote | Yes | Registers an MCP prompt that returns a ready-to-edit rules template tailored to the supplied languages/frameworks | It cannot inspect the user's repository or Figma libraries by itself; the agent fills in project-specific details after reading the codebase. | `IMPLEMENT_FULL` |

## Figma Weave tools (out of scope, blocked)

The official server also exposes Figma Weave tools. They are included here for
completeness. All require a paid standalone Weave account and Figma Weave APIs;
none can run through the Plugin API.

| Tool | Official behavior | Decision | Exact blocker |
|---|---|---|---|
| `weave_list_tools` | Lists Weave tools in the active workspace | `BLOCKED` | Weave workspace API + paid account |
| `weave_get_tool_inputs` | Gets a Weave tool's input schema | `BLOCKED` | Weave API |
| `weave_upload_asset` | Uploads a file for a Weave run | `BLOCKED` | Weave asset upload service |
| `weave_run_tool` | Runs a published Weave tool | `BLOCKED` | Weave run service + credits |
| `weave_get_tool_run_output` | Polls Weave run status/output | `BLOCKED` | Weave run service |
| `weave_cancel_tool_run` | Cancels Weave runs | `BLOCKED` | Weave run service |
| `weave_find_model` | Finds a Weave model by name | `BLOCKED` | Weave model catalog |
| `weave_run_model` | Runs a Weave model directly | `BLOCKED` | Weave model service + credits |
| `weave_get_model_run_output` | Polls model run status/output | `BLOCKED` | Weave model service |

## Not implemented on purpose

- No tool returns fabricated or empty data to claim parity.
- No cloud dependency, Figma API token, telemetry, or external service was added.
- The local tools that approximate official output (`get_design_context`,
  `get_libraries`, `search_design_system`, `get_motion_context`, shader tools)
  include a `mode`, `limitations`, or `warnings` field describing exactly what
  is missing.
- `generate_deck`, `mentionable_files`, and
  `list_file_components_for_code_connect` are documented as blocked rather
  than shipped as misleading partials. They require Figma AI, account-wide file
  search, or library/Code Connect graph data the Plugin API does not provide.
- `export_video` is implemented locally through `node.exportAsync`; it writes an
  MP4 file instead of returning a presigned URL.
