import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";

// Proxies to the standalone Python export service (export-api/), which owns
// the actual slide-copy logic (see plan: python-pptx has no equivalent on
// Node worth trusting for this). The browser never sees the Google access
// token - it's looked up server-side here and forwarded directly to that
// service, which is a small security improvement over the original design
// where the token lived in the browser's JS memory.
const EXPORT_API_URL = process.env.EXPORT_API_URL;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }
  if (!EXPORT_API_URL) {
    return NextResponse.json({ error: "EXPORT_API_URL is not configured" }, { status: 500 });
  }

  const body = await request.text();

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(session.user.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }

  const upstream = await fetch(`${EXPORT_API_URL}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Google-Access-Token": accessToken,
    },
    body,
  });

  if (!upstream.ok || !upstream.body) {
    const payload = await upstream.json().catch(() => ({ error: "export failed" }));
    return NextResponse.json(payload, { status: upstream.status || 500 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": 'attachment; filename="script.pptx"',
    },
  });
}
