import type { ComponentSnapshot, ExplorationBrief, Variation, VariationMode, VisualPrinciple } from './types.js';
import { RECIPES, composeRecipes, type RecipeSpec } from './engine.js';

/**
 * Reference- and brief-guided exploration.
 *
 * A brief (a written direction, or a visual reference we cannot read without a
 * model) is reduced to a small set of **visual principles**. Each principle maps
 * onto recipes the engine actually supports. Nothing here can execute code or
 * touch the document: it only chooses which recipes to compose. Property changes
 * are still built and validated by the engine, so a bad or hostile brief can
 * never produce an out-of-contract mutation.
 */

type PrincipleRule = {
  id: string;
  label: string;
  description: string;
  mode: VariationMode;
  keywords: string[];
  recipes: RecipeSpec[];
};

/** The dictionary of principles the deterministic parser understands. */
export const PRINCIPLE_RULES: PrincipleRule[] = [
  {
    id: 'airy',
    label: 'Generous negative space',
    description: 'Open up spacing and padding so the composition breathes.',
    mode: 'reinterpret',
    keywords: ['airy', 'spacious', 'generous', 'breathing', 'negative space', 'whitespace', 'white space', 'calm', 'open'],
    recipes: [{ id: 'density.scale', params: { factor: 1.35 } }],
  },
  {
    id: 'dense',
    label: 'Denser information',
    description: 'Compress spacing so more reads as one deliberate block.',
    mode: 'reinterpret',
    keywords: ['dense', 'compact', 'tight', 'condensed', 'information-dense', 'information dense'],
    recipes: [{ id: 'density.scale', params: { factor: 0.8 } }],
  },
  {
    id: 'editorial',
    label: 'Typographic contrast',
    description: 'Push the largest and smallest type apart for an editorial hierarchy.',
    mode: 'reinterpret',
    keywords: ['editorial', 'magazine', 'typographic contrast', 'type contrast', 'dramatic', 'bold type', 'hierarchy'],
    recipes: [
      { id: 'type.contrast', params: { factor: 1.3 } },
      { id: 'type.tracking', params: { hero: 'tight', label: 'loose' } },
    ],
  },
  {
    id: 'monochrome',
    label: 'Monochromatic restraint',
    description: 'Drain saturation so structure carries the design rather than colour.',
    mode: 'reinterpret',
    keywords: ['monochrome', 'neutral', 'quiet', 'grayscale', 'greyscale', 'restrained', 'muted'],
    recipes: [{ id: 'surface.monochrome', params: { accents: 'keep' } }],
  },
  {
    id: 'warm',
    label: 'Warm, paper-like surfaces',
    description: 'Move surfaces into a warm, paper-toned family.',
    mode: 'reinterpret',
    keywords: ['warm', 'paper', 'organic', 'earthy', 'sand', 'cream', 'linen'],
    recipes: [{ id: 'surface.tint', params: { tone: 'warm' } }],
  },
  {
    id: 'cool',
    label: 'Cool, technical surfaces',
    description: 'Move surfaces into a cool slate family.',
    mode: 'reinterpret',
    keywords: ['cool', 'slate', 'technical', 'clinical', 'steel', 'blue-grey', 'blue gray'],
    recipes: [{ id: 'surface.tint', params: { tone: 'cool' } }],
  },
  {
    id: 'indigo',
    label: 'Deep indigo surfaces',
    description: 'Move surfaces into a deep indigo family.',
    mode: 'reinterpret',
    keywords: ['indigo', 'dusk', 'deep blue', 'midnight blue'],
    recipes: [{ id: 'surface.tint', params: { tone: 'indigo' } }],
  },
  {
    id: 'dark-mode',
    label: 'Inverted, dark surface',
    description: 'Flip surfaces to their tonal opposite and re-balance the text.',
    mode: 'mutate',
    keywords: ['dark mode', 'dark-mode', 'night mode', 'invert', 'inverted', 'negative'],
    recipes: [{ id: 'surface.invert' }],
  },
  {
    id: 'sharp',
    label: 'Sharp, architectural corners',
    description: 'Move the whole component to a crisp, square corner language.',
    mode: 'reinterpret',
    keywords: ['sharp', 'brutalist', 'architectural', 'square', 'angular', 'crisp'],
    recipes: [{ id: 'radius.language', params: { style: 'sharp' } }],
  },
  {
    id: 'soft',
    label: 'Soft, rounded corners',
    description: 'Move to a gentle, rounded corner language.',
    mode: 'reinterpret',
    keywords: ['soft', 'gentle', 'approachable', 'rounded'],
    recipes: [{ id: 'radius.language', params: { style: 'soft' } }],
  },
  {
    id: 'playful',
    label: 'Playful, pill corners',
    description: 'Move to a fully rounded, playful corner language.',
    mode: 'reinterpret',
    keywords: ['playful', 'friendly', 'pill', 'capsule'],
    recipes: [{ id: 'radius.language', params: { style: 'pill' } }],
  },
  {
    id: 'refined',
    label: 'Grid-aligned refinement',
    description: 'Settle spacing and radii on the 4pt scale and fix low-contrast text.',
    mode: 'refine',
    keywords: ['refine', 'polish', 'tidy', 'aligned', 'grid', 'harmonise', 'harmonize', 'consistent', 'clean up'],
    recipes: [{ id: 'rhythm.grid' }, { id: 'radius.align' }],
  },
  {
    id: 'technical',
    label: 'Technical hairline border',
    description: 'Add a hairline border so the surface reads as a deliberate object.',
    mode: 'refine',
    keywords: ['border', 'outline', 'hairline', 'bordered', 'technical lines'],
    recipes: [{ id: 'emphasis.border', params: { weight: 1 } }],
  },
  {
    id: 'vibrant',
    label: 'Rotated accent hue',
    description: 'Rotate the surface hue for a different voice without touching layout.',
    mode: 'reinterpret',
    keywords: ['vibrant', 'colourful', 'colorful', 'energetic', 'saturated', 'accent hue', 'hue'],
    recipes: [{ id: 'surface.hue', params: { degrees: 34 } }],
  },
];

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'brief';

const scoreRule = (rule: PrincipleRule, haystack: string): number => {
  let score = 0;
  for (const keyword of rule.keywords) {
    if (haystack.includes(keyword)) score += keyword.includes(' ') ? 2 : 1;
  }
  return score;
};

/** Only recipes the engine really has survive, so a brief cannot invent a change. */
const sanitiseRecipes = (recipes: RecipeSpec[]): RecipeSpec[] =>
  recipes
    .filter((spec) => Boolean(RECIPES[spec.id]))
    .map((spec) => ({ id: spec.id, ...(spec.params ? { params: spec.params } : {}) }));

export type BriefInput = { prompt?: string; imageBase64?: string };

/**
 * Deterministic interpretation of a written brief. Always available, needs no
 * credentials, and is the fallback whenever no model is configured.
 */
export const parseBrief = (input: BriefInput): ExplorationBrief => {
  const prompt = (input.prompt ?? '').trim();
  const haystack = prompt.toLowerCase();
  const hasImage = typeof input.imageBase64 === 'string' && input.imageBase64.length > 0;

  if (!haystack && !hasImage) {
    return {
      id: 'brief:empty',
      source: 'none',
      prompt: null,
      interpretedBy: 'deterministic',
      principles: [],
      unsupported: [],
      note: 'No brief was provided.',
    };
  }

  const scored = PRINCIPLE_RULES.map((rule) => ({ rule, score: scoreRule(rule, haystack) })).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id));

  const principles: VisualPrinciple[] = scored.map(({ rule }) => ({
    id: rule.id,
    label: rule.label,
    description: rule.description,
    recipes: sanitiseRecipes(rule.recipes),
    mode: rule.mode,
  }));

  const unsupported: string[] = [];
  let source: ExplorationBrief['source'] = haystack ? 'text' : 'image';
  let note: string | null = null;

  if (hasImage && principles.length === 0) {
    note =
      'A visual reference alone cannot be read without a configured model. Set PARALLEL_AI_PROVIDER and PARALLEL_AI_API_KEY to interpret images, or describe the reference in words.';
  } else if (principles.length === 0 && haystack) {
    unsupported.push(...haystack.split(/[^a-z0-9]+/).filter((w) => w.length > 3).slice(0, 8));
    note = 'None of the words in this brief map to a transformation PARALLEL supports. Try spatial, typographic, colour or corner-language language.';
  } else if (hasImage) {
    source = 'text';
  }

  return {
    id: `brief:${slug(haystack || 'image')}`,
    source,
    prompt: prompt || null,
    interpretedBy: 'deterministic',
    principles,
    unsupported,
    note,
  };
};

/**
 * Turns a brief into directed variations. Each principle becomes one direction,
 * composed from its recipes plus the readability safety net, then validated by
 * the engine. Principles with no supported recipes yield nothing.
 */
export const generateBriefVariations = (snapshot: ComponentSnapshot, brief: ExplorationBrief, limit = 3): Variation[] => {
  const usable = brief.principles.filter((principle) => principle.recipes.length > 0).slice(0, limit);
  return usable.map((principle) => {
    const specs: RecipeSpec[] = [...principle.recipes, { id: 'contrast.readability' }];
    const { changes, rejected, used } = composeRecipes(snapshot, specs);
    const preserved = ['layout and hierarchy', 'component identity'];
    if (rejected.length > 0) preserved.push(`${rejected.length} unsupported change${rejected.length === 1 ? '' : 's'} rejected`);
    const challenges = [...new Set(principle.recipes.flatMap((spec) => RECIPES[spec.id]?.challenges ?? []))];
    return {
      id: `brief:${principle.id}:${snapshot.root.id}`,
      sourceNodeId: snapshot.root.id,
      mode: principle.mode ?? 'reinterpret',
      title: `${principle.label}`,
      rationale: principle.description,
      changeSummary: changes.length > 0 ? changes.map(describeForBrief).join('; ') : 'No supported changes for this component.',
      changes,
      preservedConstraints: preserved,
      challengedConstraints: challenges,
      origin: 'brief',
      recipes: principle.recipes.map((spec) => RECIPES[spec.id].label),
    } satisfies Variation;
  });
};

const describeForBrief = (change: ReturnType<typeof composeRecipes>['changes'][number]): string => {
  switch (change.kind) {
    case 'fill':
      return `recolour ${change.targetId} ${change.fromHex} → ${change.toHex}`;
    case 'cornerRadius':
      return `corner radius ${change.from ?? 'auto'} → ${change.to}`;
    case 'itemSpacing':
      return `spacing ${change.from ?? '—'} → ${change.to}`;
    case 'padding':
      return `padding → ${change.to.top}/${change.to.right}/${change.to.bottom}/${change.to.left}`;
    case 'fontSize':
      return `font size ${change.from} → ${change.to}`;
    case 'letterSpacing':
      return `tracking ${change.from ?? '—'} → ${change.to}`;
    case 'strokeWeight':
      return `stroke weight ${change.from ?? '—'} → ${change.to}`;
    case 'strokeColor':
      return `stroke colour ${change.fromHex ?? '—'} → ${change.toHex}`;
    case 'opacity':
      return `opacity ${change.from} → ${change.to}`;
    default:
      return 'change';
  }
};
