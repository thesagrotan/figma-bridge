import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const candidates = (): string[] => [
  ...(process.env.FIGMA_BRIDGE_PANEL_PATH ? [process.env.FIGMA_BRIDGE_PANEL_PATH] : []),
  join(process.cwd(), 'public', 'parallel.html'),
  join(here, '..', '..', 'public', 'parallel.html'),
  join(here, '..', '..', '..', 'public', 'parallel.html'),
];

const missingPanelHtml = (): string => `<!doctype html><html><body style="font-family:ui-sans-serif,system-ui;background:#0b0b0f;color:#e5e7eb;padding:48px">
<h1 style="font-size:20px">PARALLEL panel not found</h1>
<p style="color:#9ca3af;max-width:52ch">Could not locate <code>public/parallel.html</code>. Run the server from the repository root or set <code>FIGMA_BRIDGE_PANEL_PATH</code>.</p>
</body></html>`;

/**
 * Reads the PARALLEL panel and injects the bridge token.
 *
 * The server is loopback-only by default, so the token is only reachable by
 * local processes. If you bind the bridge elsewhere, serve the panel behind
 * your own auth instead.
 */
export const readPanelHtml = (bridgeToken: string): string => {
  for (const candidate of candidates()) {
    try {
      const html = readFileSync(candidate, 'utf8');
      // JSON.stringify escapes quotes but not `</script>`; a token containing
      // that sequence could otherwise break out of the injected script tag.
      const safeToken = JSON.stringify(bridgeToken).replace(/</g, '\\u003c');
      return html.replaceAll('__BRIDGE_TOKEN__', () => safeToken);
    } catch {
      continue;
    }
  }
  return missingPanelHtml();
};
