import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");
  const next = nextParam?.startsWith("/") ? nextParam : "/reset-password";
  const redirectUrl = request.nextUrl.clone();

  redirectUrl.pathname = next;
  redirectUrl.search = "";

  if (!code) {
    redirectUrl.pathname = "/forgot-password";
    redirectUrl.searchParams.set(
      "error",
      "Recovery link is missing or invalid"
    );
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirectUrl.pathname = "/forgot-password";
    redirectUrl.searchParams.set(
      "error",
      "Recovery link expired or could not be verified"
    );
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(redirectUrl);
}
