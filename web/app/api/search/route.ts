import { desc, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/google";
import { attachAttributeValues, searchPlayIdsByAttributeValue } from "@/lib/plays";
import { plays } from "@/lib/schema";
import { getSlideThumbnailUrl } from "@/lib/thumbnail-cache";

const RESULT_LIMIT = 25;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  const baseQuery = db.select().from(plays);
  const rows = q
    ? await (async () => {
        const matchingIds = await searchPlayIdsByAttributeValue(q);
        if (matchingIds.length === 0) return [];
        return baseQuery.where(inArray(plays.id, matchingIds)).orderBy(desc(plays.updatedAt)).limit(RESULT_LIMIT);
      })()
    : await baseQuery.orderBy(desc(plays.updatedAt)).limit(RESULT_LIMIT);

  const playsWithAttributes = await attachAttributeValues(rows);

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }

  const results = await Promise.all(
    playsWithAttributes.map(async (play) => {
      try {
        const thumbnailUrl = await getSlideThumbnailUrl(accessToken, play.driveFileId, play.slideIndex);
        return { ...play, thumbnailUrl };
      } catch (err) {
        return { ...play, thumbnailUrl: null, thumbnailError: (err as Error).message };
      }
    })
  );

  return NextResponse.json({ results });
}
