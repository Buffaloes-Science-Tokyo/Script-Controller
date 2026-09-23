import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { parseOptions } from "@/lib/attributeOptions";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attributeDefs, playAttributeValues } from "@/lib/schema";

type RouteParams = { params: Promise<{ id: string }> };

/** { oldValue: newValue } pairs for options renamed in the editor. */
function parseRenames(raw: unknown): Map<string, string> {
  const renames = new Map<string, string>();
  if (!raw || typeof raw !== "object") return renames;
  for (const [from, to] of Object.entries(raw)) {
    if (typeof to !== "string" || !to.trim() || to.trim() === from) continue;
    renames.set(from, to.trim());
  }
  return renames;
}

/**
 * Renames the attribute and/or replaces its options. Plays follow the
 * options: a renamed option (listed in `renames`) is renamed on every play
 * using it, and a removed option's value is cleared from those plays.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const { id } = await params;
  const [existing] = await db.select().from(attributeDefs).where(eq(attributeDefs.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "attribute not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name;
  const options = parseOptions(body.options) ?? existing.options ?? [];
  // A rename only counts if its new name survived into the final options.
  const renames = new Map(
    [...parseRenames(body.renames)].filter(([, to]) => options.includes(to))
  );

  for (const [from, to] of renames) {
    await db
      .update(playAttributeValues)
      .set({ value: to })
      .where(and(eq(playAttributeValues.attributeDefId, id), eq(playAttributeValues.value, from)));
  }

  const removed = (existing.options ?? []).filter((o) => !options.includes(o) && !renames.has(o));
  if (removed.length > 0) {
    await db
      .delete(playAttributeValues)
      .where(and(eq(playAttributeValues.attributeDefId, id), inArray(playAttributeValues.value, removed)));
  }

  const [attribute] = await db
    .update(attributeDefs)
    .set({ name, type: "select", options })
    .where(eq(attributeDefs.id, id))
    .returning();

  return NextResponse.json({ attribute });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const { id } = await params;
  await db.delete(attributeDefs).where(eq(attributeDefs.id, id));
  return NextResponse.json({ ok: true });
}
