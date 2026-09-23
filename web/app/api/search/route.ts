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

  // Several `q` params = several search words; a play must match every word
  // (each word may match any of its attribute values).
  const terms = request.nextUrl.searchParams
    .getAll("q")
    .map((q) => q.trim())
    .filter(Boolean);

  let matchingIds: string[] | null = null;
  for (const term of terms) {
    const ids = await searchPlayIdsByAttributeValue(term);
    matchingIds = matchingIds === null ? ids : matchingIds.filter((id) => ids.includes(id));
    if (matchingIds.length === 0) return NextResponse.json({ results: [] });
  }

  const baseQuery = db.select().from(plays);
  const rows = await (matchingIds !== null ? baseQuery.where(inArray(plays.id, matchingIds)) : baseQuery)
    .orderBy(desc(plays.updatedAt))
    .limit(RESULT_LIMIT);

  // Thumbnails are loaded per card by the client (lib/deckThumbnails.ts),
  // one deck render per file, so results come back without waiting on Drive.
  const results = await attachAttributeValues(rows);
  return NextResponse.json({ results });
}
