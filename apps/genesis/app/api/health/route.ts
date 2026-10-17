import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    check: "liveness",
    system: "genesis",
    owner: "Metatility",
    version: "0.1.0",
    role: "Genesis operating platform",
    dependencies_verified: false,
  }, { headers: { "Cache-Control": "no-store" } });
}
