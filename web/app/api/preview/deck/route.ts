import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { getDeckThumbnails } from "@/lib/thumbnail-cache";

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
