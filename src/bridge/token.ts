/**
 * Constant-time-ish token comparison, shared by the HTTP and WebSocket paths.
 *
 * Folds the length difference into the accumulating diff and iterates over the
 * longer of the two strings, so a mismatch never short-circuits early and the
 * comparison time does not track the position of the first wrong character.
 */
export const tokensMatch = (provided: unknown, expected: string): boolean => {
  if (typeof provided !== 'string') return false;
  let diff = provided.length ^ expected.length;
  const max = Math.max(provided.length, expected.length);
  for (let i = 0; i < max; i++) {
    diff |= (provided.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
};
