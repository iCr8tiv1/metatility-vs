import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions/auth";

const nav = [
  { label: "Command Center", href: "/", glyph: "⌂" },
  { label: "Agents", href: "/agents", glyph: "◎" },
  { label: "Work", href: "/work", glyph: "▣" },
  { label: "Campaigns", href: "/campaigns", glyph: "↗" },
  { label: "Intelligence", href: "/intelligence", glyph: "◇" },
  { label: "Assets", href: "/content", glyph: "◫" },
  { label: "Leads", href: "/leads", glyph: "⌁" },
  { label: "Nurture", href: "/nurture", glyph: "↺" },
  { label: "Approvals", href: "/approvals", glyph: "✓" },
  { label: "Analytics", href: "/analytics", glyph: "∿" },
  { label: "Knowledge", href: "/knowledge", glyph: "◈" },
  { label: "Integrations", href: "/integrations", glyph: "⌘" },
];

export function AppShell({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  const immersive = active === "Command Center";

  return (
    <div className={immersive ? "app-shell command-center-shell" : "app-shell"}>
      <aside className="sidebar">
        <div>
          <div className="brand-row genesis-brand-row">
            <div className="genesis-orbit-mark" aria-hidden="true">
              <span />
            </div>
            <div>
              <strong>Genesis</strong>
              <span>AI WORKFORCE OS</span>
            </div>
          </div>

          <nav>
            {nav.map((item) => (
              <Link
                className={item.label === active ? "nav-item active" : "nav-item"}
                href={item.href}
                key={item.label}
              >
                <span className="nav-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="system-mini-card">
            <span className="system-light" />
            <div>
              <strong>Genesis Core</strong>
              <span>Governed · Online</span>
            </div>
          </div>
          <form action={signOut}>
            <button className="nav-item signout-item" type="submit">
              <span className="nav-glyph" aria-hidden="true">↪</span>
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
