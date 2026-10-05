import { signIn } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark">G</div>
        <p className="eyebrow">METATILITY</p>
        <h1>Genesis</h1>
        <p className="muted">Sign in to the AI marketing operating system.</p>

        <form action={signIn} className="form-stack">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="error-message">{error}</p> : null}
          <button type="submit" className="primary-button">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
