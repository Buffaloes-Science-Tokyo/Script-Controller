import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { getSlideThumbnailUrl } from "@/lib/thumbnail-cache";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const fileId = request.nextUrl.searchParams.get("fileId");
  const slideIndexParam = request.nextUrl.searchParams.get("slideIndex");
  const slideIndex = slideIndexParam !== null ? Number(slideIndexParam) : NaN;

  if (!fileId || Number.isNaN(slideIndex)) {
    return NextResponse.json({ error: "fileId and slideIndex are required" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }

  try {
    const thumbnailUrl = await getSlideThumbnailUrl(accessToken, fileId, slideIndex);
    return NextResponse.json({ thumbnailUrl });
  } catch (err) {
    const status = err instanceof RangeError ? 400 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
