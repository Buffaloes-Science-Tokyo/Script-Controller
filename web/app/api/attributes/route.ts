import { asc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { parseOptions } from "@/lib/attributeOptions";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attributeDefs } from "@/lib/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const attributes = await db.select().from(attributeDefs).orderBy(asc(attributeDefs.sortOrder));
  return NextResponse.json({ attributes });
}

/**
 * Creates an attribute. Every attribute is a growable choice list, so
 * options are optional here - values typed when registering a play are
 * added to them automatically (lib/attributeValues.ts).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const options = parseOptions(body.options) ?? [];

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [{ maxSortOrder }] = await db
    .select({ maxSortOrder: sql<number>`coalesce(max(${attributeDefs.sortOrder}), -1)` })
    .from(attributeDefs);

  const [attribute] = await db
    .insert(attributeDefs)
    .values({ name, type: "select", options, sortOrder: maxSortOrder + 1 })
    .returning();

  return NextResponse.json({ attribute }, { status: 201 });
}
