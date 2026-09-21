import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plays } from "@/lib/schema";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign in required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const playName = typeof body.playName === "string" ? body.playName.trim() : "";
  const formation = typeof body.formation === "string" ? body.formation.trim() : "";
  const driveFileId = typeof body.driveFileId === "string" ? body.driveFileId : "";
  const slideIndex = Number(body.slideIndex);

  if (!playName || !driveFileId) {
    return NextResponse.json({ error: "playName and driveFileId are required" }, { status: 400 });
  }
  if (!Number.isInteger(slideIndex) || slideIndex < 0) {
    return NextResponse.json({ error: "slideIndex must be a non-negative integer" }, { status: 400 });
  }

  const [play] = await db
    .insert(plays)
    .values({
      playName,
      formation,
      driveFileId,
      slideIndex,
      createdBy: session.user.id,
    })
    .returning();

  return NextResponse.json({ play }, { status: 201 });
}
