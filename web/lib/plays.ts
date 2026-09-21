import { and, eq, ilike, inArray } from "drizzle-orm";

import { db } from "./db";
import { attributeDefs, playAttributeValues } from "./schema";

export type PlayAttributeValue = {
  attributeDefId: string;
  name: string;
  type: "text" | "select";
  value: string;
};

/**
 * Attaches each play's attribute values (joined against attributeDefs,
 * grouped by play, ordered by the attribute's sortOrder) - the shared shape
 * both /api/search and /api/plays return, since a play no longer has a
 * fixed name/formation to display on its own.
 */
export async function attachAttributeValues<T extends { id: string }>(
  basePlays: T[]
): Promise<(T & { attributes: PlayAttributeValue[] })[]> {
  if (basePlays.length === 0) return [];

  const playIds = basePlays.map((p) => p.id);
  const rows = await db
    .select({
      playId: playAttributeValues.playId,
      attributeDefId: playAttributeValues.attributeDefId,
      name: attributeDefs.name,
      type: attributeDefs.type,
      value: playAttributeValues.value,
    })
    .from(playAttributeValues)
    .innerJoin(attributeDefs, eq(playAttributeValues.attributeDefId, attributeDefs.id))
    .where(inArray(playAttributeValues.playId, playIds))
    .orderBy(attributeDefs.sortOrder);

  const byPlayId = new Map<string, PlayAttributeValue[]>();
  for (const row of rows) {
    const list = byPlayId.get(row.playId) ?? [];
    list.push({ attributeDefId: row.attributeDefId, name: row.name, type: row.type, value: row.value });
    byPlayId.set(row.playId, list);
  }

  return basePlays.map((p) => ({ ...p, attributes: byPlayId.get(p.id) ?? [] }));
}

/** Play ids with at least one attribute value ILIKE-matching the query. */
export async function searchPlayIdsByAttributeValue(query: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ playId: playAttributeValues.playId })
    .from(playAttributeValues)
    .where(ilike(playAttributeValues.value, `%${query}%`));
  return rows.map((r) => r.playId);
}

export type AttributeFilter = { attributeDefId: string; type: "text" | "select"; value: string };

/**
 * Play ids matching every given filter (AND across filters; exact match for
 * `select`, ILIKE for `text`). Returns null when there are no filters, so
 * callers can distinguish "no restriction" from "matched nothing".
 */
export async function filterPlayIdsByAttributes(filters: AttributeFilter[]): Promise<string[] | null> {
  if (filters.length === 0) return null;

  let resultIds: Set<string> | null = null;
  for (const filter of filters) {
    const valueCondition =
      filter.type === "select"
        ? eq(playAttributeValues.value, filter.value)
        : ilike(playAttributeValues.value, `%${filter.value}%`);

    const rows = await db
      .selectDistinct({ playId: playAttributeValues.playId })
      .from(playAttributeValues)
      .where(and(eq(playAttributeValues.attributeDefId, filter.attributeDefId), valueCondition));

    const ids = new Set(rows.map((r) => r.playId));
    if (resultIds === null) {
      resultIds = ids;
    } else {
      const intersected = new Set<string>();
      for (const id of resultIds) {
        if (ids.has(id)) intersected.add(id);
      }
      resultIds = intersected;
    }
    if (resultIds.size === 0) break;
  }

  return resultIds ? [...resultIds] : [];
}
