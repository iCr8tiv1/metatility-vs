import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions/auth";

const nav = [
  { label: "Command Center", href: "/" },
  { label: "Agents" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Leads", href: "/leads" },
  { label: "Approvals", href: "/approvals" },
  { label: "Audiences", href: "/audiences" },
  { label: "Content" },
  { label: "Intelligence", href: "/intelligence" },
  { label: "Analytics" },
  { label: "Knowledge" },
  { label: "Integrations" },
];

export function AppShell({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-row">
            <div className="brand-mark compact">G</div>
            <div>
              <strong>Genesis</strong>
              <span>by Metatility</span>
            </div>
          </div>

          <nav>
            {nav.map((item) =>
              item.href ? (
                <Link
                  className={item.label === active ? "nav-item active" : "nav-item"}
                  href={item.href}
                  key={item.label}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="nav-item disabled" key={item.label}>
                  {item.label}
                </span>
              )
            )}
          </nav>
        </div>

        <form action={signOut}>
          <button className="nav-item" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
