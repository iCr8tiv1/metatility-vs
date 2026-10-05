import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">G</div>
        <p className="eyebrow">METATILITY</p>
        <h1>Reset password</h1>
        <p className="muted">
          Enter the email address associated with Genesis. We&apos;ll send a
          secure recovery link.
        </p>

        {sent ? (
          <div className="notice success">
            Recovery email sent. Open the email on this device and follow the
            link to choose a new password.
          </div>
        ) : null}

        {error ? <div className="notice error">{error}</div> : null}

        <form action={requestPasswordReset} className="form-stack">
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue="icr8tiv1@gmail.com"
              required
            />
          </label>
          <button type="submit" className="primary-button">
            Send reset email
          </button>
        </form>

        <div className="auth-footer">
          <Link href="/login">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
