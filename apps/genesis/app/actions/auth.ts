"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeBaseUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=Email%20and%20password%20are%20required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=Unable%20to%20sign%20in");
  }

  redirect("/");
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect("/forgot-password?error=Enter%20your%20email%20address");
  }

  const headerStore = await headers();
  const configuredBase = safeBaseUrl(process.env.NEXT_PUBLIC_SITE_URL ?? null);
  const requestOrigin = safeBaseUrl(headerStore.get("origin"));
  const host = headerStore.get("host");
  const forwardedProto = headerStore.get("x-forwarded-proto") ?? "https";
  const hostBase = host
    ? safeBaseUrl(`${forwardedProto}://${host}`)
    : null;
  const baseUrl = configuredBase ?? requestOrigin ?? hostBase;

  if (!baseUrl) {
    redirect("/forgot-password?error=Password%20recovery%20is%20not%20configured");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    redirect("/forgot-password?error=Unable%20to%20send%20the%20reset%20email");
  }

  redirect("/forgot-password?sent=1");
}

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 12) {
    redirect("/reset-password?error=Password%20must%20be%20at%20least%2012%20characters");
  }

  if (password !== confirmPassword) {
    redirect("/reset-password?error=Passwords%20do%20not%20match");
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect("/forgot-password?error=Reset%20link%20expired%20or%20is%20invalid");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect("/reset-password?error=Unable%20to%20update%20the%20password");
  }

  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?reset=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
