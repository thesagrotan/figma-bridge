---
name: figma-design-to-code
description: "**MANDATORY prerequisite** — you MUST trigger this skill whenever the user wants to implement, build, port, or code up a Figma design as code (React, Tailwind, HTML/CSS, SwiftUI, etc.). Example prompts (not exhaustive) are 'implement this Figma design', 'build this screen from Figma', 'turn this Figma into code', 'design to code'. This skill provides critical instructions and steps for extracting design context using `figma-bridge` tools and implementing designs with pixel fidelity."
disable-model-invocation: false
---

# Figma Design to Code

## Context & Workflow in `figma-bridge`

`figma-bridge` connects directly to the local active document in Figma Desktop (or via the local HTTP bridge at `http://localhost:3000`). Upstream remote tools like `get_design_context` are not used in `figma-bridge`; instead, design context is extracted locally and deterministically using the following pipeline:

### Step 1: Visual Target (`get_screenshot`)
- Call `get_screenshot({ nodeId })` (or pass `name`) to capture a 2x PNG rendering of the target node or selection.
- Treat this render as the **visual source of truth** that the rendered implementation MUST visually match.
- **NEVER** use the screenshot itself as an asset in the codebase (e.g. as a background image).

### Step 2: Structural Layout (`get_metadata`)
- Call `get_metadata({ nodeId, maxDepth: 4 })` (or `POST /execute` with `{"type": "get_node_tree", "payload": { "nodeId": "...", "maxDepth": 4 }}`) to inspect the node hierarchy tree.
- Extract the structural layout blueprint:
  - **Auto Layout**: Layout direction (`layoutMode`: `"HORIZONTAL"` | `"VERTICAL"` | `"NONE"`), `itemSpacing`, and alignment (`primaryAxisAlignItems`, `counterAxisAlignItems`).
  - **Padding & Insets**: `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`.
  - **Sizing & Bounds**: `width`, `height`, sizing modes (`primaryAxisSizingMode`, `counterAxisSizingMode`).
  - **Hierarchy**: Child order, nested frames, groups, and text layers.

### Step 3 (Optional): Precision Styling & Typography (`use_figma`)
- When exact colors, typography, or styling details are needed beyond metadata, query them directly via `use_figma({ code })`:
  ```javascript
  const node = figma.getNodeById("TARGET_NODE_ID");
  return {
    fills: node.fills,
    strokes: node.strokes,
    strokeWeight: node.strokeWeight,
    cornerRadius: node.cornerRadius,
    effects: node.effects,
    typography: node.type === "TEXT" ? {
      fontName: node.fontName,
      fontSize: node.fontSize,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
      textCase: node.textCase,
    } : null,
  };
  ```
- Use this to verify exact hex/RGB values, opacities, gradients, drop shadows, and font weights.

### Step 4 (Optional): Cloud REST API (`figma_get_nodes`)
- If a `fileKey` is provided and cloud REST tools are configured, you may optionally call `figma_get_nodes({ fileKey, ids: [nodeId] })` to inspect the full REST AST or `figma_render_nodes` for cloud image exports.
- For local files connected to Figma Desktop, Steps 1–3 are preferred as they run instantly with zero rate limits.

---

## Implementation Principles

- **Inspect Project Conventions First**:
  - You MUST inspect likely project paths and installed dependencies (`package.json`, styles, Tailwind config, component libraries) BEFORE editing code.
  - Determine the tech stack (React, Next.js, Vue, Svelte, HTML/CSS, Tailwind CSS, SwiftUI) and adhere strictly to its established patterns, file structure, and naming conventions.

- **Layout & Structure**:
  - Use the screenshot as the visual reference and the metadata/tree as the structural layout reference.
  - Translate Figma Auto Layout into project-native layout constructs (e.g., Flexbox `flex flex-col gap-4`, CSS Grid, Auto-Layout equivalents) rather than raw absolute positioning.
  - Only use fixed or absolute positioning if the design explicitly specifies an overlay, floating badge, or absolute element.

- **Component & Token Reuse**:
  - Inspect project paths and installed design library dependencies for existing UI components (e.g., buttons, dialogs, badges, inputs in shadcn/ui, Radix, MUI) and design tokens (Tailwind colors, CSS variables).
  - You MUST reuse or compose matching project components and tokens instead of recreating them with raw markup, inline styles, or hardcoded magic numbers. Modify or supplement existing components only when they cannot accurately express the design.
  - When Code Connect mappings exist for target nodes, directly reuse the connected components.

- **Interactivity**:
  - Treat Figma designs as blueprints for interactive applications, not static mockups.
  - Identify interactive elements (buttons, inputs, links, hover/focus/active states, toggles, dropdowns) and implement them with appropriate semantics (`<button>`, `<input>`, `<nav>`, `<a>`) and event handlers.

- **Static Asset Handling**:
  - Use each visible static asset (vector icon, SVG, illustration, image) in the EXACT position and slot used in the design.
  - Substitute only for exact matches found in the codebase or installed icon library (e.g., Lucide, Heroicons, SF Symbols).
  - NEVER omit, edit, redraw, extract arbitrary paths from, inline blindly, or substitute an asset when the original asset is needed.
  - Keep API-, prop-, or data-supplied imagery dynamic.
  - Export static assets cleanly via `figma-bridge` tools (e.g., `export_node` or `use_figma`) or download necessary resources, ensuring NO references to temporary URLs or placeholders remain in code.
  - All SVG assets must preserve their native `viewBox` and aspect ratio; do not apply destructive 100% × 100% overrides that distort vectors.

---

## Verification

- **Scope**:
  - Verify only the requested screen or component. Note, but do not alter, pre-existing out-of-scope mismatches in the codebase.

- **Visual & Structural Alignment**:
  - Compare the rendered code output against the visual target screenshot obtained in Step 1.
  - Cross-check layout dimensions, padding, gaps, typography, and color tokens against the metadata obtained in Step 2 and styling from Step 3.

- **Asset Integrity**:
  - You MUST verify EVERY visible static asset: non-empty local file, correct design slot/layer, correct callsite, and proper effective rendered geometry.
  - A single substituted, mismatched, or misproportioned asset is a FAIL. Fix all in-scope mismatches before completing the task.
