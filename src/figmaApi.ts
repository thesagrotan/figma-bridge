if (!process.env.FIGMA_PERSONAL_ACCESS_TOKEN) {
  throw new Error("FIGMA_PERSONAL_ACCESS_TOKEN is required");
}
const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;

const cache = new Map<string, { value: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();
const ttl = Number(process.env.FIGMA_CACHE_TTL_MS ?? 30_000);

export const bustCache = (pattern?: string): void => {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
};

export const figmaRequest = <T>(path: string, init?: RequestInit): Promise<T> => {
  const isGet = !init?.method || init.method.toUpperCase() === 'GET';
  const cacheKey = path;

  if (isGet) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value as T);
    }
    const pending = inFlight.get(cacheKey);
    if (pending) {
      return pending as Promise<T>;
    }
  }

  const promise = (async () => {
    const response = await fetch(`https://api.figma.com${path}`, {
      ...init,
      headers: {
        "X-Figma-Token": token,
        Accept: "application/json",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Figma API ${response.status}: ${message}`);
    }

    const data = await response.json();
    if (isGet) {
      cache.set(cacheKey, { value: data, expiresAt: Date.now() + ttl });
    }
    return data as T;
  })();

  if (isGet) {
    inFlight.set(cacheKey, promise);
    promise.finally(() => {
      inFlight.delete(cacheKey);
    });
  }

  return promise;
};
