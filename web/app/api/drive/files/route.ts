import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getValidAccessToken, listFolder } from "@/lib/google";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const folderId = request.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json({ error: "folderId is required" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(session.user.id);
    const files = await listFolder(accessToken, folderId);
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}
