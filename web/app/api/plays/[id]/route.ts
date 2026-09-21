import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachAttributeValues } from "@/lib/plays";
import { attributeDefs, playAttributeValues, plays } from "@/lib/schema";

type RouteParams = { params: Promise<{ id: string }> };

/** Replaces a play's attribute values wholesale (used by the click-to-edit popup). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const { id } = await params;
  const [existing] = await db.select().from(plays).where(eq(plays.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "play not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const attributeValues: Record<string, unknown> =
    body.attributes && typeof body.attributes === "object" ? body.attributes : {};

  const defs = await db.select().from(attributeDefs);
  const defsById = new Map(defs.map((d) => [d.id, d]));

  const rowsToInsert: { attributeDefId: string; value: string }[] = [];
  for (const [attributeDefId, rawValue] of Object.entries(attributeValues)) {
    if (typeof rawValue !== "string" || !rawValue.trim()) continue;
    const value = rawValue.trim();
    const def = defsById.get(attributeDefId);
    if (!def) {
      return NextResponse.json({ error: `unknown attribute id: ${attributeDefId}` }, { status: 400 });
    }
    if (def.type === "select" && !(def.options ?? []).includes(value)) {
      return NextResponse.json(
        { error: `"${value}" is not one of ${def.name}'s options` },
        { status: 400 }
      );
    }
    rowsToInsert.push({ attributeDefId, value });
  }

  // Replace wholesale: clear this play's values, then insert the submitted set.
  await db.delete(playAttributeValues).where(eq(playAttributeValues.playId, id));
  if (rowsToInsert.length > 0) {
    await db.insert(playAttributeValues).values(rowsToInsert.map((r) => ({ ...r, playId: id })));
  }

  const [playWithAttributes] = await attachAttributeValues([existing]);
  return NextResponse.json({ play: playWithAttributes });
}
