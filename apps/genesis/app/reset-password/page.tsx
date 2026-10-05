import { redirect } from "next/navigation";
import { updatePassword } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect("/forgot-password?error=Open%20a%20valid%20recovery%20link%20first");
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">G</div>
        <p className="eyebrow">METATILITY</p>
        <h1>Choose a new password</h1>
        <p className="muted">
          Use at least 12 characters. After the password is changed, Genesis
          will sign out all sessions and return you to sign in.
        </p>

        {error ? <div className="notice error">{error}</div> : null}

        <form action={updatePassword} className="form-stack">
          <label>
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <button type="submit" className="primary-button">
            Update password
          </button>
        </form>
      </section>
    </main>
  );
}
