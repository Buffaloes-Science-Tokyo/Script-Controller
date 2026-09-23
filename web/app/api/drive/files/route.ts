import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getValidAccessToken,
  listFolderChildren,
  NoLinkedGoogleAccountError,
} from "@/lib/google";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    return NextResponse.json(
      { error: "DRIVE_ROOT_FOLDER_ID is not configured on the server" },
      { status: 500 }
    );
  }

  const folderId = request.nextUrl.searchParams.get("folderId") || rootFolderId;

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (err) {
    const status = err instanceof NoLinkedGoogleAccountError ? 401 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }

  try {
    const files = await listFolderChildren(accessToken, folderId);
    return NextResponse.json({ folderId, files });
  } catch (err) {
    const details = (err as { response?: { data?: unknown }; code?: unknown; errors?: unknown });
    console.error(
      "listFolderChildren failed",
      folderId,
      JSON.stringify({
        message: (err as Error).message,
        code: details.code,
        errors: details.errors,
        responseData: details.response?.data,
      })
    );
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
