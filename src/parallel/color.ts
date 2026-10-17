import type { Rgba } from './types.js';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const rgbaToHex = (color: Rgba): string => {
  const toByte = (channel: number) => Math.round(clamp01(channel) * 255).toString(16).padStart(2, '0');
  return `#${toByte(color.r)}${toByte(color.g)}${toByte(color.b)}`;
};

export const hexToRgba = (hex: string, alpha = 1): Rgba => {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
    a: clamp01(alpha),
  };
};

export const mixRgba = (a: Rgba, b: Rgba, t: number): Rgba => {
  const ratio = clamp01(t);
  return {
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
    a: a.a + (b.a - a.a) * ratio,
  };
};

/** Relative luminance per WCAG 2.1. */
export const luminance = (color: Rgba): number => {
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
};

export const contrastRatio = (a: Rgba, b: Rgba): number => {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
};

export const lighten = (color: Rgba, amount: number): Rgba => mixRgba(color, { r: 1, g: 1, b: 1, a: color.a }, amount);

export const darken = (color: Rgba, amount: number): Rgba => mixRgba(color, { r: 0, g: 0, b: 0, a: color.a }, amount);

export const isDark = (color: Rgba): boolean => luminance(color) < 0.5;

/** Rotate hue by `degrees`, preserving lightness feel. Simple RGB hue rotation. */
export const rotateHue = (color: Rgba, degrees: number): Rgba => {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { r, g, b, a } = color;
  // Standard luminance-preserving hue rotation matrix.
  const nr = (0.213 + cos * 0.787 - sin * 0.213) * r + (0.715 - cos * 0.715 - sin * 0.715) * g + (0.072 - cos * 0.072 + sin * 0.928) * b;
  const ng = (0.213 - cos * 0.213 + sin * 0.143) * r + (0.715 + cos * 0.285 + sin * 0.14) * g + (0.072 - cos * 0.072 - sin * 0.283) * b;
  const nb = (0.213 - cos * 0.213 - sin * 0.787) * r + (0.715 - cos * 0.715 + sin * 0.715) * g + (0.072 + cos * 0.928 + sin * 0.072) * b;
  return { r: clamp01(nr), g: clamp01(ng), b: clamp01(nb), a };
};

/** Saturation multiplier (1 = unchanged, 0 = greyscale). */
export const saturate = (color: Rgba, factor: number): Rgba => {
  const grey = luminance(color);
  return mixRgba({ r: grey, g: grey, b: grey, a: color.a }, color, Math.max(0, factor));
};

export const isNearGrey = (color: Rgba, threshold = 0.06): boolean => {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  return max - min < threshold;
};
