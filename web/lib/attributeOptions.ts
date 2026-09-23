/** Trimmed, non-empty, de-duplicated option strings; undefined if not an array. */
export function parseOptions(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const options = raw
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim());
  return [...new Set(options)];
}
