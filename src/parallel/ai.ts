import type { ExplorationBrief, VisualPrinciple } from './types.js';
import { RECIPES, type RecipeSpec } from './engine.js';
import { PRINCIPLE_RULES, parseBrief, type BriefInput } from './brief.js';

/**
 * Optional, bounded model-assisted interpretation of a design brief.
 *
 * Design constraints (deliberate):
 *  - Off by default. The deterministic parser in `brief.ts` is the baseline.
 *  - The model may only choose from the recipe whitelist. Its output is a set of
 *    principle → recipe selections; it can never emit code, node ids or raw
 *    Figma properties, so it cannot mutate the document or escape the contract.
 *  - Reference images are treated as untrusted input. They are sent to the
 *    model as image bytes only; nothing from the image is executed or eval'd.
 *  - No credentials are invented. Without an explicit provider + key the model
 *    path reports "not configured" and the caller falls back deterministically.
 */

const provider = (process.env.PARALLEL_AI_PROVIDER ?? 'none').trim().toLowerCase();
const apiKey = process.env.PARALLEL_AI_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
const baseUrl = (process.env.PARALLEL_AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
const model = process.env.PARALLEL_AI_MODEL ?? 'gpt-4o-mini';

export const isAiConfigured = (): boolean => provider !== 'none' && provider !== '' && apiKey.length > 0;

export class AiNotConfiguredError extends Error {
  constructor() {
    super('No AI provider is configured. Set PARALLEL_AI_PROVIDER and PARALLEL_AI_API_KEY to enable model-assisted interpretation.');
    this.name = 'AiNotConfiguredError';
  }
}

/** The recipe catalogue, described for a model prompt. */
const recipeCatalogue = (): string =>
  Object.values(RECIPES)
    .map((recipe) => `- ${recipe.id}: ${recipe.intent}`)
    .join('\n');

const SYSTEM_PROMPT = `You are a design-direction interpreter for a Figma exploration tool.
You receive a design brief (text and/or a reference image). Extract 1-4 visual principles.
For each principle, choose ONLY from the allowed transformation recipes below. Never invent recipe ids.
Respond with STRICT JSON, no markdown, matching:
{"principles":[{"id":"kebab-id","label":"Short label","description":"One sentence.","recipes":[{"id":"recipe.id","params":{}}]}]}
Allowed recipes:
${recipeCatalogue()}`;

type ModelPrinciple = { id?: unknown; label?: unknown; description?: unknown; recipes?: unknown };

const coerceParams = (raw: unknown): RecipeSpec['params'] | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string' && value.length < 40) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/** Validates model output: unknown recipe ids are dropped, params coerced. */
export const sanitisePrinciples = (raw: unknown): VisualPrinciple[] => {
  if (!Array.isArray(raw)) return [];
  const principles: VisualPrinciple[] = [];
  for (const entry of raw as ModelPrinciple[]) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 40) : '';
    if (!id) continue;
    const recipes: RecipeSpec[] = [];
    if (Array.isArray(entry.recipes)) {
      for (const spec of entry.recipes as Array<{ id?: unknown; params?: unknown }>) {
        if (!spec || typeof spec !== 'object') continue;
        const recipeId = typeof spec.id === 'string' ? spec.id : '';
        if (!RECIPES[recipeId]) continue;
        recipes.push({ id: recipeId, ...(coerceParams(spec.params) ? { params: coerceParams(spec.params)! } : {}) });
      }
    }
    if (recipes.length === 0) continue;
    principles.push({
      id,
      label: typeof entry.label === 'string' ? entry.label.slice(0, 60) : id,
      description: typeof entry.description === 'string' ? entry.description.slice(0, 200) : '',
      recipes,
    });
  }
  return principles.slice(0, 4);
};

const callModel = async (input: BriefInput): Promise<unknown> => {
  if (!isAiConfigured()) throw new AiNotConfiguredError();

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: input.prompt?.trim() || 'Interpret this reference as visual principles.' }];
  if (input.imageBase64) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${input.imageBase64}` } });
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    }),
  });

  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI provider returned no content');
  return JSON.parse(text);
};

/**
 * Interprets a brief, preferring the model when configured and falling back to
 * the deterministic parser on any failure. The returned brief always records
 * how it was produced.
 */
export const interpretBrief = async (input: BriefInput): Promise<ExplorationBrief> => {
  const deterministic = parseBrief(input);
  if (!isAiConfigured()) {
    return { ...deterministic, note: deterministic.note ?? 'Interpreting with the built-in rules (no AI provider configured).' };
  }

  try {
    const raw = await callModel(input);
    const principles = sanitisePrinciples((raw as { principles?: unknown }).principles);
    if (principles.length === 0) return deterministic;
    return {
      id: `brief:ai:${Date.now().toString(36)}`,
      source: input.prompt ? 'text' : input.imageBase64 ? 'image' : 'none',
      prompt: input.prompt?.trim() || null,
      interpretedBy: 'model',
      principles,
      unsupported: [],
      note: `Interpreted by ${model}.`,
    };
  } catch (error) {
    return {
      ...deterministic,
      note: `Model interpretation unavailable (${error instanceof Error ? error.message : String(error)}). Used the built-in rules instead.`,
    };
  }
};

export { PRINCIPLE_RULES };
