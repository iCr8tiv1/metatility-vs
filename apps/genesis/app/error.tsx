"use client";

import Link from "next/link";

export default function GenesisError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="empty-state">
    <p className="eyebrow">GENESIS</p>
    <h1>This view could not be loaded</h1>
    <p>Your last action may still have been saved. Reload the view to check its current state before repeating it.</p>
    <button className="primary-button" onClick={reset}>Reload view</button>{" "}
    <Link href="/foundation">Check foundation status</Link>
  </main>;
}
