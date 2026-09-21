import { asc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attributeDefs } from "@/lib/schema";

function parseOptions(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.options)) return [];
  return body.options
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim());
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const attributes = await db.select().from(attributeDefs).orderBy(asc(attributeDefs.sortOrder));
  return NextResponse.json({ attributes });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type === "select" || body.type === "text" ? body.type : null;
  const options = parseOptions(body);

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!type) {
    return NextResponse.json({ error: "type must be 'text' or 'select'" }, { status: 400 });
  }
  if (type === "select" && options.length === 0) {
    return NextResponse.json({ error: "select type requires at least one option" }, { status: 400 });
  }

  const [{ maxSortOrder }] = await db
    .select({ maxSortOrder: sql<number>`coalesce(max(${attributeDefs.sortOrder}), -1)` })
    .from(attributeDefs);

  const [attribute] = await db
    .insert(attributeDefs)
    .values({
      name,
      type,
      options: type === "select" ? options : null,
      sortOrder: maxSortOrder + 1,
    })
    .returning();

  return NextResponse.json({ attribute }, { status: 201 });
}
