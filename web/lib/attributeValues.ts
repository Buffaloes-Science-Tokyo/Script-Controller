import { eq } from "drizzle-orm";

import { db } from "./db";
import { attributeDefs } from "./schema";

export type AttributeValueRow = { attributeDefId: string; value: string };

/**
 * Validates submitted attribute values and returns the rows to store.
 * Attributes are growable choice lists: a value that isn't one of the
 * attribute's options yet is appended to them, so it can be picked next time.
 * Returns an error message instead for unknown attribute ids.
 */
export async function prepareAttributeValues(
  submitted: Record<string, unknown>
): Promise<{ rows: AttributeValueRow[] } | { error: string }> {
  const defs = await db.select().from(attributeDefs);
  const defsById = new Map(defs.map((d) => [d.id, d]));

  const rows: AttributeValueRow[] = [];
  const newOptionsByDef = new Map<string, string[]>();
  for (const [attributeDefId, rawValue] of Object.entries(submitted)) {
    if (typeof rawValue !== "string" || !rawValue.trim()) continue;
    const value = rawValue.trim();
    const def = defsById.get(attributeDefId);
    if (!def) return { error: `unknown attribute id: ${attributeDefId}` };

    const options = def.options ?? [];
    if (!options.includes(value)) newOptionsByDef.set(def.id, [...options, value]);
    rows.push({ attributeDefId, value });
  }

  for (const [id, options] of newOptionsByDef) {
    await db.update(attributeDefs).set({ type: "select", options }).where(eq(attributeDefs.id, id));
  }

  return { rows };
}
