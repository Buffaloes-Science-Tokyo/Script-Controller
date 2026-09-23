import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { prepareAttributeValues } from "@/lib/attributeValues";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/google";
import { attachAttributeValues, filterPlayIdsByAttributes, type AttributeFilter } from "@/lib/plays";
import { attributeDefs, playAttributeValues, plays } from "@/lib/schema";
import { getDeckThumbnails } from "@/lib/thumbnail-cache";

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

  // Snapshot the slide's current render so later views can tell whether it
  // changed since registration. The admin UI has just loaded this deck, so
  // this is normally a cache hit.
  let slideHash: string;
  try {
    const accessToken = await getValidAccessToken(session.user.id);
    const deck = await getDeckThumbnails(accessToken, driveFileId);
    if (slideIndex >= deck.hashes.length) {
      return NextResponse.json(
        { error: `slideIndex ${slideIndex} out of range (deck has ${deck.hashes.length} slides)` },
        { status: 400 }
      );
    }
    slideHash = deck.hashes[slideIndex];
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const prepared = await prepareAttributeValues(attributeValues);
  if ("error" in prepared) {
    return NextResponse.json({ error: prepared.error }, { status: 400 });
  }
  const rowsToInsert = prepared.rows;

  const [play] = await db
    .insert(plays)
    .values({ driveFileId, slideIndex, slideHash, createdBy: session.user.id })
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

  const driveFileId = searchParams.get("driveFileId");
  const conditions = [
    matchingIds !== null ? inArray(plays.id, matchingIds) : undefined,
    driveFileId ? eq(plays.driveFileId, driveFileId) : undefined,
  ];

  const rows = await db
    .select()
    .from(plays)
    .where(and(...conditions))
    .orderBy(desc(plays.updatedAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const results = await attachAttributeValues(pageRows);

  return NextResponse.json({ results, hasMore });
}
