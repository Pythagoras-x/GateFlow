/**
 * Deterministic JSON stringifier.
 * Keys in objects are sorted alphabetically to ensure identical hashes
 * regardless of key ordering in the source object.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJson(item)).join(',') + ']';
  }

  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const pairs = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  );

  return '{' + pairs.join(',') + '}';
}
