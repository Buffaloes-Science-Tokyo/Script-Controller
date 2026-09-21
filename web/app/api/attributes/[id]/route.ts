import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attributeDefs } from "@/lib/schema";

type RouteParams = { params: Promise<{ id: string }> };

function parseOptions(body: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(body.options)) return undefined;
  return body.options
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim());
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const { id } = await params;
  const [existing] = await db.select().from(attributeDefs).where(eq(attributeDefs.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "attribute not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : existing.name;
  const type = body.type === "text" || body.type === "select" ? body.type : existing.type;
  const options = parseOptions(body) ?? existing.options ?? [];

  if (type === "select" && options.length === 0) {
    return NextResponse.json({ error: "select type requires at least one option" }, { status: 400 });
  }

  const [attribute] = await db
    .update(attributeDefs)
    .set({ name, type, options: type === "select" ? options : null })
    .where(eq(attributeDefs.id, id))
    .returning();

  return NextResponse.json({ attribute });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const { id } = await params;
  await db.delete(attributeDefs).where(eq(attributeDefs.id, id));
  return NextResponse.json({ ok: true });
}
