/**
 * PARALLEL live check.
 *
 * Runs the real exploration loop against a running bridge, which in turn talks
 * to the Figma plugin. Writes each direction's preview to disk so the result is
 * inspectable even without the panel.
 *
 * Usage:
 *   npm start                     # in one terminal (the bridge + MCP server)
 *   npm run parallel:check        # in another; add -- --apply to apply + discard
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const port = Number(process.env.PORT ?? 3000);
const token = process.env.FIGMA_BRIDGE_TOKEN ?? 'local-development-token';
const base = `http://127.0.0.1:${port}`;
const outDir = join(process.cwd(), 'parallel-out');

const headers = { 'Content-Type': 'application/json', 'X-Bridge-Token': token };

const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok || json.ok === false) throw new Error(String(json.error ?? `HTTP ${response.status}`));
  return json;
};

const save = (name: string, base64: string | null): string | null => {
  if (!base64) return null;
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(base64, 'base64'));
  return file;
};

const main = async (): Promise<void> => {
  const health = (await (await fetch(`${base}/health`)).json()) as { pluginConnected?: boolean };
  console.log(`bridge: ${base} · plugin connected: ${health.pluginConnected ? 'yes' : 'no'}`);

  const { result } = (await post('/parallel/explore', {})) as {
    result: {
      snapshot: { root: { name: string; type: string; width: number; height: number }; nodeCount: number; context: { pageName: string } };
      variations: Array<{ id: string; mode: string; title: string; changeSummary: string; preservedConstraints: string[]; challengedConstraints: string[] }>;
      previews: { originalBase64: string | null; previews: Array<{ variationId: string; status: string; imageBase64: string | null; message: string | null }> };
      warnings: string[];
    };
  };

  const snapshot = result.snapshot;
  console.log(`\nInspected "${snapshot.root.name}" (${snapshot.root.type}) ${Math.round(snapshot.root.width)}×${Math.round(snapshot.root.height)} · ${snapshot.nodeCount} nodes · page "${snapshot.context.pageName}"`);

  const originalFile = save('original', result.previews.originalBase64);
  if (originalFile) console.log(`original  → ${originalFile}`);

  console.log('\nDirections');
  for (const variation of result.variations) {
    const preview = result.previews.previews.find((p) => p.variationId === variation.id);
    const file = preview ? save(variation.mode, preview.imageBase64) : null;
    console.log(`\n  [${variation.mode}] ${variation.title}`);
    console.log(`    changes:   ${variation.changeSummary}`);
    console.log(`    keeps:     ${variation.preservedConstraints.join(', ')}`);
    if (variation.challengedConstraints.length) console.log(`    pushes:    ${variation.challengedConstraints.join(', ')}`);
    console.log(`    preview:   ${preview ? preview.status : 'missing'}${file ? ` → ${file}` : ''}${preview?.message ? ` (${preview.message})` : ''}`);
  }

  if (result.warnings.length) console.log(`\nWarnings:\n  ${result.warnings.join('\n  ')}`);

  if (process.argv.includes('--apply')) {
    const target = result.variations.find((v) => v.mode === 'mutate') ?? result.variations[0];
    console.log(`\nApplying [${target.mode}] ${target.id} to a duplicate…`);
    const applied = (await post('/parallel/apply', { variationId: target.id, approved: true })) as { applied: { createdNodeId: string | null; createdNodeName: string | null; appliedChangeKinds: string[]; warnings: string[]; success: boolean; error: string | null } };
    console.log(`  success:   ${applied.applied.success}`);
    console.log(`  new node:  ${applied.applied.createdNodeId} (${applied.applied.createdNodeName})`);
    console.log(`  applied:   ${applied.applied.appliedChangeKinds.join(', ') || 'none'}`);
    if (applied.applied.warnings.length) console.log(`  warnings:  ${applied.applied.warnings.join('; ')}`);
    if (applied.applied.error) console.log(`  error:     ${applied.applied.error}`);

    if (applied.applied.createdNodeId) {
      await post('/parallel/discard', { nodeId: applied.applied.createdNodeId });
      console.log(`  discarded: ${applied.applied.createdNodeId} removed; original untouched`);
    }
  }
};

main().catch((error) => {
  console.error(`\nLive check failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Is the server running (npm start) and the Local Figma Bridge plugin open in Figma Desktop?');
  process.exit(1);
});
