# Genesis component browser verification

This isolated harness bundles the actual `CommandForm`, `TaskCard`, `TaskResult`, `AttemptHistory`, `SubmitButton`, and application CSS. It serves neutral fixtures on loopback. The only substitutions are server action functions that record `FormData` and return simulated responses, and a native anchor in place of Next navigation.

The bundle rejects imports of production server actions, Supabase clients, and the runtime server. The Playwright tests reject external network requests. No testing route is added to the application, and no production authentication bypass, live data, provider request, or database write is involved.

## Run

From `apps/genesis` with dependencies installed:

```sh
npx playwright install chromium
npx playwright test
```

For an already installed Chromium executable, set `GENESIS_TEST_CHROMIUM_PATH` to its absolute path. A custom Playwright browser cache can be selected through the standard `PLAYWRIGHT_BROWSERS_PATH` variable. The default local port is `4179`; override `GENESIS_BROWSER_TEST_PORT` if necessary. Results and screenshots default to `/tmp/genesis-browser-test-results`; set `GENESIS_BROWSER_TEST_OUTPUT` to preserve them elsewhere.

## Scope of proof

The checks exercise actual browser form validation, React action pending state, exact task and run identity, ambiguous-command retry identity, revision feedback, disabled unsafe controls, output escaping, history rendering, and layouts at 360 and 1280 pixels.

This is component behavior proof. It does not verify Next server action transport, authenticated navigation, Supabase sessions or RLS, actual model generation, deployed environment configuration, or production end-to-end behavior. Those require separate runtime, database, and authenticated deployment verification.

## Recorded local verification

On **2026-10-17 at 21:46 UTC**, all **12 tests passed** in Chromium Headless Shell **141.0.7390.37**, using Playwright Test **1.64.1** and Node **24.19.0**. TypeScript checking also passed. The review, Director, and command fixtures produced screenshots at both viewport widths; visual inspection found readable controls and content without clipping.

The installed Playwright version's default Chromium archive download failed. An official Playwright 1.56.1 installer fetched the older Chromium binary through Microsoft's alternate Playwright mirror. Only the browser executable was reused; the project's Playwright dependency was unchanged. The executed test command was:

```sh
GENESIS_TEST_CHROMIUM_PATH=/tmp/genesis-playwright-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell npx playwright test
```

The restricted executor required approved sandbox escalation to open the loopback fixture server. No production service was accessed. A clean environment should normally install the browser matching its pinned Playwright version; use the executable override only when that download is unavailable.
