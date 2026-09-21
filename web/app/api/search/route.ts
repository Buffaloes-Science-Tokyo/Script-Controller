import { desc, ilike, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/google";
import { plays } from "@/lib/schema";
import { getSlideThumbnailUrl } from "@/lib/thumbnail-cache";

const RESULT_LIMIT = 25;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  const rows = q
    ? await db
        .select()
        .from(plays)
        .where(or(ilike(plays.playName, `%${q}%`), ilike(plays.formation, `%${q}%`)))
        .orderBy(desc(plays.updatedAt))
        .limit(RESULT_LIMIT)
    : await db.select().from(plays).orderBy(desc(plays.updatedAt)).limit(RESULT_LIMIT);

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }

  const results = await Promise.all(
    rows.map(async (play) => {
      try {
        const thumbnailUrl = await getSlideThumbnailUrl(
          accessToken,
          play.driveFileId,
          play.slideIndex
        );
        return { ...play, thumbnailUrl };
      } catch (err) {
        return { ...play, thumbnailUrl: null, thumbnailError: (err as Error).message };
      }
    })
  );

  return NextResponse.json({ results });
}
