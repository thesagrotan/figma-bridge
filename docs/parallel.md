# PARALLEL

Visual exploration for Figma components: inspect a selection, generate three
distinct directions, compare them side by side, and apply one to a **duplicate**
— never to the original.

```
select a component → inspect → generate 3 directions → render previews
                   → compare → choose → confirm → apply to a duplicate → verify
```

| Direction | Intent | Typical moves |
|---|---|---|
| **Refine** | Improve the design, keep its character | snap spacing to the 4pt grid, align radii, fix low-contrast text |
| **Reinterpret** | Different visual language, same purpose | retint the surface, flip the corner language, re-track type |
| **Mutate** | Experimental push, explicit about constraints | invert the surface (keeping content legible), zero the radius, widen tracking |

Every direction reports which constraints it **keeps** and which it **pushes**.

## Two interfaces, one pipeline

1. **MCP tools** — `parallel_explore`, `parallel_apply`, `parallel_discard`.
   Agent-driven; previews are returned as image blocks.
2. **PARALLEL panel** — a local page served by the bridge at
   `http://127.0.0.1:<PORT>/parallel`. Side-by-side comparison with explicit
   confirmation before anything is applied.

Both call the same pipeline (`src/parallel/pipeline.ts`).

## Architecture

```mermaid
flowchart TD
    P[MCP client] -->|stdio| S[src/index.ts<br/>MCP server]
    W[PARALLEL panel<br/>public/parallel.html] -->|HTTP| S
    S --> PL[src/parallel/pipeline.ts<br/>orchestration]
    PL --> SN[snapshot.ts<br/>normalize]
    PL --> EN[engine.ts<br/>pure rules]
    S -->|WebSocket| F[plugin/code.js<br/>clone · apply · export · remove]
    F --> C[Figma Canvas]
```

- `src/parallel/types.ts` — shared contracts (`ComponentSnapshot`, `Variation`,
  `VariationPreview`, `AppliedVariation`).
- `src/parallel/snapshot.ts` — plugin tree → normalized snapshot with
  per-node `capabilities` (what may safely change).
- `src/parallel/engine.ts` — **pure** rule engine. Reads a snapshot, emits
  validated `PropertyChange[]`. No Figma access, fully fixture-testable.
- `src/parallel/pipeline.ts` — orchestrates inspect → generate → render, and
  owns the variation registry used for safe application.
- `src/parallel/color.ts` — colour maths (contrast, luminance, hue, mix).
- `src/ui/panel.ts` + `public/parallel.html` — the panel.
- `plugin/code.js` — deterministic commands: `parallel_snapshot`,
  `parallel_preview`, `parallel_apply`, `parallel_discard`.

## Why applying is safe

- **The original is never mutated.** Preview and apply both operate on
  `node.clone()`; previews remove the clone immediately after rendering.
- **Clients cannot inject mutations.** `parallel_apply` takes only a
  variation id. The server looks the variation up in its registry and applies
  the changes *it* generated.
- **Changes are validated twice.** Once when generated, once before dispatch
  (`validateChanges`), against the snapshot captured at generation time.
- **Unsupported edits are rejected, not guessed.** Anything a node cannot
  support is dropped with a reason.
- **Child ids are remapped.** A clone has new descendant ids; the plugin maps
  old → new so edits land on the duplicate, never the source.
- **Partial failures are surfaced.** A single failed property becomes a warning;
  the rest still apply and the created node id is returned.
- **Discard is first-class.** `parallel_discard` removes the created node.

## Run

```bash
npm install
cp .env.example .env            # set FIGMA_PERSONAL_ACCESS_TOKEN (REST tools only)
npm start                       # MCP server + bridge

# In Figma Desktop: Plugins → Development → Import plugin from manifest…
#   → plugin/manifest.json, then run "Local Figma Bridge", leave it open.
```

Open the panel: <http://127.0.0.1:3000/parallel?token=local-development-token>
(The token may also be sent as an `X-Bridge-Token` header; the query form exists because browsers cannot attach headers to a top-level navigation.)

> The bridge binds to **127.0.0.1** only. If port 3000 is busy it increments
> (3001, 3002, …) and the active port is written to `.bridge-port`.

## Verify

```bash
npm run typecheck      # src, strict
npm test               # 39 tests: units, plugin node ops, real HTTP/WS integration
npm run parallel:check # live: explores the current selection, writes PNGs to parallel-out/
npm run parallel:check -- --apply   # also applies the mutate direction, then discards it
```

Test layers:

| Layer | What it proves |
|---|---|
| `tests/*.test.ts` (units) | normalization, engine rules, validation, pipeline states |
| `tests/plugin.test.ts` | the **real** `plugin/code.js` node ops against a fake Figma API: original untouched, id remapping, partial failures, discard |
| `tests/bridge.test.ts` | the **real** HTTP + WebSocket bridge with a mock plugin: token gating, CORS, panel, full loop, timeouts |
| `npm run parallel:check` | the pipeline against a **live** Figma document (needs the plugin open) |

## Demo script (interview, ~4 min)

1. **Framing.** "Exploring alternatives in Figma is manual and destructive.
   PARALLEL makes it systematic and reversible."
2. **Set up.** Show `.env`, `npm start`, then the green plugin dot in Figma.
3. **Pick a real component.** Select a dashboard card or command palette.
4. **Open the panel** at `http://127.0.0.1:3000/parallel?token=local-development-token`. Point out the
   connection indicator and the "original — untouched" reference.
5. **Explore.** Press *Explore selection*. Call out the snapshot chips
   (type, size, node count) and the three cards appearing.
6. **Read the work.** For each card: what changed, what it keeps, what it pushes.
   Emphasise that Refine is subtle, Reinterpret changes the language, Mutate
   challenges the assumptions.
7. **Apply.** Press *Apply to duplicate* → the confirmation dialog → confirm.
   Show the toast with the new node id. Both components are visible in Figma.
8. **Prove the original is safe.** Compare the original against the duplicate.
   Press *Discard duplicate* — the node disappears, the original is untouched.
9. **Close.** "Same loop is available to agents through three MCP tools."

### Fallback if Figma is unavailable

`npm run parallel:check` writes `parallel-out/original.png`,
`refine.png`, `reinterpret.png`, `mutate.png`. Walk through those and the
`parallel_explore` MCP output. Then run `npm test` to show the 39 passing
checks, including the plugin node-operations suite.

## Limitations (honest)

- **Previews are transient document nodes.** Each preview clones the component
  next to it, exports at 2×, and removes the clone within milliseconds. Offscreen
  rendering is not used, so there is a brief flash in Figma.
- **No AI in the loop.** Directions are deterministic rules. An LLM could
  propose directions or explain them, but it must not drive mutations.
- **A small, supported property set.** The engine currently emits four kinds:
  **fill**, **corner radius**, **item spacing**, **letter spacing**. The plugin
  can also apply stroke, padding, font size/style and opacity, but the rules do
  not use them yet. Gradients, effects and vector geometry are out of scope.
- **Contrast correction assumes the root is the background.** Nested surfaces
  can fool it.
- **One file at a time.** Commands run in whichever file has the plugin open.
- **The registry is in memory.** Restarting the server invalidates variation
  ids; re-run explore.
- **Not production-hardened.** The bridge executes code inside Figma. Keep it
  loopback-only.

## Security posture

- Binds to `127.0.0.1` by default (`FIGMA_BRIDGE_HOST` overrides; non-loopback
  binds log a loud warning).
- CORS is an allowlist (loopback origins + `null` for the plugin iframe), never
  `*`.
- The shared bridge token is compared in constant time and never logged; the
  Figma personal access token is never logged or sent to the plugin.
- Starting with `NODE_ENV=production` and the default token throws.
- `/health` reports liveness and plugin connectivity, not auth state.
- The panel injects the token because the server is loopback-only; if you bind
  elsewhere, put your own auth in front of it.
