import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    system: "genesis",
    owner: "Metatility",
    version: "0.1.0",
    role: "AI Marketing Operating System",
  });
}
