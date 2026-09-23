import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { prepareAttributeValues } from "@/lib/attributeValues";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachAttributeValues } from "@/lib/plays";
import { playAttributeValues, plays } from "@/lib/schema";

type RouteParams = { params: Promise<{ id: string }> };

/** Deletes a play; its attribute values go with it via the FK cascade. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await db.delete(plays).where(eq(plays.id, id)).returning({ id: plays.id });
  if (deleted.length === 0) {
    return NextResponse.json({ error: "play not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

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

  const prepared = await prepareAttributeValues(attributeValues);
  if ("error" in prepared) {
    return NextResponse.json({ error: prepared.error }, { status: 400 });
  }
  const rowsToInsert = prepared.rows;

  // Replace wholesale: clear this play's values, then insert the submitted set.
  await db.delete(playAttributeValues).where(eq(playAttributeValues.playId, id));
  if (rowsToInsert.length > 0) {
    await db.insert(playAttributeValues).values(rowsToInsert.map((r) => ({ ...r, playId: id })));
  }

  const [playWithAttributes] = await attachAttributeValues([existing]);
  return NextResponse.json({ play: playWithAttributes });
}
