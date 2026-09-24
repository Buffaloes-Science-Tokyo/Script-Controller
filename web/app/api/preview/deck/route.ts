import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/google";
import { plays } from "@/lib/schema";
import { getDeckThumbnails, persistentThumbnailUrl, type DeckThumbnails } from "@/lib/thumbnail-cache";

// Rendering stops after ~20s (lib/thumbnail-cache.ts); leave headroom for
// the Drive copy/cleanup around it.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }

  try {
    // May be partial (null entries): the client calls again after
    // retryAfterMs until complete, showing slides as they arrive.
    const deck = await getDeckThumbnails(accessToken, fileId);
    await backfillPlayThumbnails(fileId, deck);
    return NextResponse.json({
      thumbnailUrls: deck.urls,
      slideHashes: deck.hashes,
      complete: deck.complete,
      retryAfterMs: deck.retryAfterMs,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Gives this deck's plays that have no stored thumbnail (registered before
 * thumbnails were stored) their slide's current render, so later listings
 * skip Google. Only when the slide still matches its registered hash - an
 * edited slide shouldn't be pinned as the registered one.
 */
async function backfillPlayThumbnails(fileId: string, deck: DeckThumbnails) {
  try {
    const missing = await db
      .select({ id: plays.id, slideIndex: plays.slideIndex, slideHash: plays.slideHash })
      .from(plays)
      .where(and(eq(plays.driveFileId, fileId), isNull(plays.thumbnailUrl)));
    for (const play of missing) {
      const url = persistentThumbnailUrl(deck.urls[play.slideIndex]);
      const hash = deck.hashes[play.slideIndex];
      if (!url || !hash || (play.slideHash && play.slideHash !== hash)) continue;
      await db
        .update(plays)
        .set({ thumbnailUrl: url })
        .where(eq(plays.id, play.id));
    }
  } catch (err) {
    // Only an optimization: the thumbnails themselves are still returned.
    console.error("Failed to backfill play thumbnails", err);
  }
}
