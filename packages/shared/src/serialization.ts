/**
 * Safe JSON parsing and object path resolution utilities.
 */

export function safeJsonParse<T = unknown>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(val: unknown, space = 2): string {
  try {
    return JSON.stringify(val, null, space);
  } catch {
    return String(val);
  }
}

/**
 * Safely extracts a nested property using dot/bracket notation without eval.
 */
export function getNestedProperty(obj: unknown, path: string): unknown {
  if (!obj || !path || path.trim() === '') return obj;

  const keys = path
    .replace(/\[(\w+)\]/g, '.$1')
    .split('.')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}
