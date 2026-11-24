/**
 * Safely extracts a nested property using dot/bracket notation without eval.
 * Example: "items[0].user.name" or "response.data"
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
