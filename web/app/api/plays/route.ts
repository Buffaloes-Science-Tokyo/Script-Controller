import { desc, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachAttributeValues, filterPlayIdsByAttributes, type AttributeFilter } from "@/lib/plays";
import { attributeDefs, playAttributeValues, plays } from "@/lib/schema";

const DEFAULT_LIMIT = 30;
const FILTER_PREFIX = "attr_";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const driveFileId = typeof body.driveFileId === "string" ? body.driveFileId : "";
  const slideIndex = Number(body.slideIndex);
  const attributeValues: Record<string, unknown> =
    body.attributes && typeof body.attributes === "object" ? body.attributes : {};

  if (!driveFileId) {
    return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });
  }
  if (!Number.isInteger(slideIndex) || slideIndex < 0) {
    return NextResponse.json({ error: "slideIndex must be a non-negative integer" }, { status: 400 });
  }

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

  const [play] = await db
    .insert(plays)
    .values({ driveFileId, slideIndex, createdBy: session.user.id })
    .returning();

  if (rowsToInsert.length > 0) {
    await db
      .insert(playAttributeValues)
      .values(rowsToInsert.map((r) => ({ ...r, playId: play.id })));
  }

  const [playWithAttributes] = await attachAttributeValues([play]);
  return NextResponse.json({ play: playWithAttributes }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1), 100);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  const defs = await db.select().from(attributeDefs);
  const defsById = new Map(defs.map((d) => [d.id, d]));

  const filters: AttributeFilter[] = [];
  for (const [key, value] of searchParams.entries()) {
    if (!key.startsWith(FILTER_PREFIX) || !value.trim()) continue;
    const attributeDefId = key.slice(FILTER_PREFIX.length);
    const def = defsById.get(attributeDefId);
    if (!def) continue;
    filters.push({ attributeDefId, type: def.type, value: value.trim() });
  }

  const matchingIds = await filterPlayIdsByAttributes(filters);
  if (matchingIds !== null && matchingIds.length === 0) {
    return NextResponse.json({ results: [], hasMore: false });
  }

  const baseQuery = db.select().from(plays);
  const rows = await (matchingIds !== null ? baseQuery.where(inArray(plays.id, matchingIds)) : baseQuery)
    .orderBy(desc(plays.updatedAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const results = await attachAttributeValues(pageRows);

  return NextResponse.json({ results, hasMore });
}
