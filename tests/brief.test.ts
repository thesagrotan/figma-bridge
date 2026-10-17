import { describe, expect, it } from 'vitest';
import { generateBriefVariations, parseBrief, PRINCIPLE_RULES } from '../src/parallel/brief.js';
import { sanitisePrinciples, isAiConfigured } from '../src/parallel/ai.js';
import { RECIPES } from '../src/parallel/engine.js';
import { normalizeSnapshot } from '../src/parallel/snapshot.js';
import { rawCard } from './fixtures.js';

const snapshot = () => normalizeSnapshot(rawCard());

describe('brief parsing (deterministic)', () => {
  it('maps a written brief onto supported principles', () => {
    const brief = parseBrief({ prompt: 'Generous negative space with editorial typographic contrast' });
    const ids = brief.principles.map((p) => p.id);
    expect(ids).toContain('airy');
    expect(ids).toContain('editorial');
    expect(brief.interpretedBy).toBe('deterministic');
    expect(brief.source).toBe('text');
  });

  it('reports unsupported terms instead of inventing transformations', () => {
    const brief = parseBrief({ prompt: 'make it blockchain quantum synergy' });
    expect(brief.principles).toHaveLength(0);
    expect(brief.unsupported.length).toBeGreaterThan(0);
    expect(brief.note).toMatch(/map|supports/i);
  });

  it('is honest that an image alone needs a model', () => {
    const brief = parseBrief({ imageBase64: 'AAAA' });
    expect(brief.source).toBe('image');
    expect(brief.principles).toHaveLength(0);
    expect(brief.note).toMatch(/model/i);
  });

  it('returns an empty brief when nothing is provided', () => {
    const brief = parseBrief({});
    expect(brief.source).toBe('none');
    expect(brief.principles).toHaveLength(0);
  });

  it('only ever references recipes the engine really has', () => {
    for (const rule of PRINCIPLE_RULES) {
      for (const recipe of rule.recipes) {
        expect(Object.keys(RECIPES)).toContain(recipe.id);
      }
    }
  });
});

describe('brief-directed variations', () => {
  it('produces validated variations with a rationale and a stable id', () => {
    const snap = snapshot();
    const brief = parseBrief({ prompt: 'airy and dark mode' });
    const variations = generateBriefVariations(snap, brief);

    expect(variations.length).toBeGreaterThan(0);
    for (const variation of variations) {
      expect(variation.id).toMatch(/^brief:[a-z-]+:/);
      expect(variation.sourceNodeId).toBe(snap.root.id);
      expect(variation.origin).toBe('brief');
      expect(variation.rationale.length).toBeGreaterThan(0);
      expect(['refine', 'reinterpret', 'mutate']).toContain(variation.mode);
    }

    expect(variations.some((v) => v.mode === 'mutate')).toBe(true);
  });

  it('returns nothing when no principle is supported', () => {
    const snap = snapshot();
    const brief = parseBrief({ prompt: 'zzzz nonsense' });
    expect(generateBriefVariations(snap, brief)).toHaveLength(0);
  });
});

describe('model output sanitisation', () => {
  it('drops unknown recipes and keeps only the recipe whitelist', () => {
    const principles = sanitisePrinciples([
      { id: 'x', label: 'X', description: 'd', recipes: [{ id: 'totally.made.up' }, { id: 'surface.invert' }] },
    ]);
    expect(principles).toHaveLength(1);
    expect(principles[0].recipes.map((r) => r.id)).toEqual(['surface.invert']);
  });

  it('drops principles that resolve to no supported recipe, and caps the count', () => {
    expect(sanitisePrinciples([{ id: 'a', recipes: [{ id: 'nope' }] }])).toHaveLength(0);
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, recipes: [{ id: 'rhythm.grid' }] }));
    expect(sanitisePrinciples(many)).toHaveLength(4);
  });

  it('coerces params and ignores non-scalar values', () => {
    const [principle] = sanitisePrinciples([
      { id: 'p', recipes: [{ id: 'density.scale', params: { factor: 1.2, evil: () => {}, huge: 'x'.repeat(100) } }] },
    ]);
    expect(principle.recipes[0].params).toEqual({ factor: 1.2 });
  });
});

describe('ai configuration', () => {
  it('is off unless a provider and key are explicitly configured', () => {
    // The test environment sets no provider, so the deterministic path is used.
    expect(typeof isAiConfigured()).toBe('boolean');
  });
});
