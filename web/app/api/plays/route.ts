import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { prepareAttributeValues } from "@/lib/attributeValues";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/google";
import { attachAttributeValues, filterPlayIdsByAttributes, type AttributeFilter } from "@/lib/plays";
import { attributeDefs, playAttributeValues, plays } from "@/lib/schema";
import { getCachedSlide, persistentThumbnailUrl } from "@/lib/thumbnail-cache";

// Rendering stops after ~20s (lib/thumbnail-cache.ts); leave headroom for
// the Drive copy/cleanup around it.
export const maxDuration = 60;

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
  const overwrite = body.overwrite === true;

  if (!driveFileId) {
    return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });
  }
  if (!Number.isInteger(slideIndex) || slideIndex < 0) {
    return NextResponse.json({ error: "slideIndex must be a non-negative integer" }, { status: 400 });
  }

  // One play per slide: re-registering a slide overwrites its existing play,
  // but only when the client confirmed it (the form's "上書きしますか？").
  const existingPlays = await db
    .select({ id: plays.id })
    .from(plays)
    .where(and(eq(plays.driveFileId, driveFileId), eq(plays.slideIndex, slideIndex)))
    .orderBy(desc(plays.updatedAt));
  if (existingPlays.length > 0 && !overwrite) {
    return NextResponse.json(
      { error: "このスライドは既に登録されています。", code: "already_registered" },
      { status: 409 }
    );
  }

  // Snapshot the slide's current render so later views can tell whether it
  // changed since registration. Read from the cache only: the registration
  // form has just loaded (rendered) this deck, and saving must not wait on -
  // or fail because of - rendering.
  let slideHash: string;
  let thumbnailUrl: string | null;
  try {
    const accessToken = await getValidAccessToken(session.user.id);
    const cachedSlide = await getCachedSlide(accessToken, driveFileId, slideIndex);
    if (!cachedSlide) {
      return NextResponse.json(
        { error: "このスライドの画像を生成中です。表示されてからもう一度保存してください。" },
        { status: 503 }
      );
    }
    slideHash = cachedSlide.hash;
    thumbnailUrl = persistentThumbnailUrl(cachedSlide.url);
  } catch (err) {
    const status = err instanceof RangeError ? 400 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  const prepared = await prepareAttributeValues(attributeValues);
  if ("error" in prepared) {
    return NextResponse.json({ error: prepared.error }, { status: 400 });
  }
  const rowsToInsert = prepared.rows;

  let play: typeof plays.$inferSelect;
  if (existingPlays.length > 0) {
    // Overwrite the newest play in place (keeping its id, so baskets holding
    // it stay valid) and drop any older duplicates from before one-per-slide.
    const [keep, ...duplicates] = existingPlays;
    [play] = await db
      .update(plays)
      .set({ slideHash, thumbnailUrl, createdBy: session.user.id, updatedAt: new Date() })
      .where(eq(plays.id, keep.id))
      .returning();
    if (duplicates.length > 0) {
      await db.delete(plays).where(inArray(plays.id, duplicates.map((p) => p.id)));
    }
    await db.delete(playAttributeValues).where(eq(playAttributeValues.playId, play.id));
  } else {
    [play] = await db
      .insert(plays)
      .values({ driveFileId, slideIndex, slideHash, thumbnailUrl, createdBy: session.user.id })
      .returning();
  }

  if (rowsToInsert.length > 0) {
    await db
      .insert(playAttributeValues)
      .values(rowsToInsert.map((r) => ({ ...r, playId: play.id })));
  }

  const [playWithAttributes] = await attachAttributeValues([play]);
  return NextResponse.json(
    { play: playWithAttributes, overwritten: existingPlays.length > 0 },
    { status: existingPlays.length > 0 ? 200 : 201 }
  );
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
    // A value picked from the attribute's options matches exactly; anything
    // else typed into the filter matches partially.
    const type = (def.options ?? []).includes(value.trim()) ? "select" : "text";
    filters.push({ attributeDefId, type, value: value.trim() });
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
