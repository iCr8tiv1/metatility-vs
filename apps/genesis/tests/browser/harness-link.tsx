import type { AnchorHTMLAttributes } from "react";

// Navigation is not under test. Keep the component's native link semantics
// without importing a Next router into this explicitly test-only harness.
export default function HarnessLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
