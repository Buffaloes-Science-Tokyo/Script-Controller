import { desc, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachAttributeValues, searchPlayIdsByAttributeValue } from "@/lib/plays";
import { plays } from "@/lib/schema";

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

  // Thumbnails are loaded per card by the client (lib/useSlideThumbnail.ts),
  // one deck render per file, so results come back without waiting on Drive.
  const results = await attachAttributeValues(rows);
  return NextResponse.json({ results });
}
