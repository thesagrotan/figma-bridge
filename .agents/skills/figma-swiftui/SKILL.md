---
name: figma-swiftui
description: "SwiftUI ↔ Figma translation. Use whenever the user mentions Swift, SwiftUI, iOS, iPhone, or iPad — in EITHER direction — translating a Figma design into SwiftUI (design → code), or pushing SwiftUI views / screens / tokens back into a Figma file (code → design). Triggers on phrases like 'implement this Figma design in SwiftUI', 'build this screen in Swift', 'push this SwiftUI view to Figma', 'mirror my Swift code in a Figma file', or whenever a Figma URL appears alongside `.swift` files / an `.xcodeproj`. Works with both cloud Figma (get_design_context) and local figma-bridge (get_metadata, get_screenshot, use_figma). Routes to a direction-specific reference doc; loads alongside `figma-use` for the code → design path."
disable-model-invocation: false
---

# Figma ↔ SwiftUI

Translation between Figma designs and SwiftUI code, both directions. This file is a router — actual guidance lives in the references below.

## Pick the direction

| Direction | Trigger | Primary tools | Reference |
|---|---|---|---|
| **Design → code** | User wants SwiftUI in their iOS project from a Figma file/frame | `get_design_context` (cloud) OR `get_metadata` + `get_screenshot` + `use_figma` (figma-bridge) | [references/design-to-code.md](references/design-to-code.md) |
| **Code → design** | User wants to push SwiftUI views / screens / tokens into a Figma file | `use_figma` + `get_screenshot` | [references/code-to-design.md](references/code-to-design.md) |

If the request is ambiguous — a Figma URL and `.swift` files both present, no verb makes it clear — ask the user which direction before loading a reference.

## Shared context (applies to both directions)

These points hold regardless of direction; the direction-specific references assume them.

1. **Reading from Figma: `get_design_context` with fallback to `figma-bridge`.**
   - When available, call `get_design_context` with `clientLanguages: "swift"` and `clientFrameworks: "swiftui"`. Parse URL → args: `figma.com/design/:fileKey/:fileName?node-id=:nodeId` → `fileKey`, replacing `-` with `:` in `nodeId`. For branches `.../branch/:branchKey/...`, use `branchKey` as `fileKey`.
   - **`figma-bridge` Fallback (bridge mode or missing/erroring `get_design_context`):**
     Seamlessly fall back to `figma-bridge` canvas MCP tools or the local HTTP bridge:
     - `get_metadata({ nodeId, maxDepth })` to inspect the node hierarchy, node names, Auto Layout properties, and dimensions.
     - `get_screenshot({ nodeId, name })` to capture a 2x PNG rendering — the visual source of truth.
     - `use_figma({ code })` to query exact font names, styles, colors, paint fills, bound variables, or node properties directly from the document context.
     - Local HTTP bridge alternative: `POST http://localhost:3000/execute` with `inspect`, `get_node_tree`, `export_node`, or `use_figma`.
2. **The screenshot is the source of truth; structural references are not literal code.** In `get_design_context` output, React+Tailwind is an approximation; in `figma-bridge`, `get_metadata` describes structure. Never transliterate `position: absolute` / pixel frames / `mix-blend-mode` stacks into SwiftUI or Figma — match the screenshot visually using idiomatic native layouts.
3. **iOS HIG semantic colors are tokens, not hex.** `var(--backgrounds/primary, …)`, `var(--labels/secondary, …)`, `var(--separators/non-opaque, …)` etc. (or Figma variables queried via `use_figma`/`get_metadata`) map to `Color(.systemBackground)`, `Color.secondary`, `Color(.separator)` in SwiftUI, and to variables in a semantic collection in Figma. Keep the semantic mapping; drop the literal RGBA.
4. **SF Symbols round-trip by name in both directions — never by codepoint.**
   - Design → code: `get_design_context` substitutes Figma's SF Symbol glyph runs into `<SFSymbol>{Image(systemName: "...")}</SFSymbol>` wrappers. When using `figma-bridge`, discover symbol names from node names (e.g. `icon/chevron.right`), text layer contents queried via `use_figma`, or visual matching against SF Symbols from `get_screenshot`.
   - Code → design: call `figma.util.getSfSymbolCharacter(name)` inside `use_figma` to convert a symbol name to the matching character — never look up codepoints by hand.
5. **Recognize the underlying iOS pattern, not the literal node / view name.** The same patterns recur in both directions: large title + back chevron + trailing action = `NavigationStack` chrome; bottom row of icon+label pairs = `TabView`; repeating same-height rows with leading/trailing chrome = `List`. Match those system patterns rather than rebuilding them from primitives.
6. **For code → design, `use_figma` and `get_screenshot` drive the workflow.** Always load [`figma-use`](../figma-use/SKILL.md) before any `use_figma` call. Build incrementally in Figma using `use_figma`, track created/mutated node IDs, and verify each step visually with `get_screenshot`. If the task involves building a full screen, also load [`figma-generate-design`](../figma-generate-design/SKILL.md); if it involves building components or a design system, also load [`figma-generate-library`](../figma-generate-library/SKILL.md).

## References

| Doc | When to load |
|---|---|
| [references/design-to-code.md](references/design-to-code.md) | Translating a Figma design / frame into SwiftUI |
| [references/code-to-design.md](references/code-to-design.md) | Pushing SwiftUI views / screens / tokens into Figma |
