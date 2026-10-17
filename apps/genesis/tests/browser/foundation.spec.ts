import { expect, test, type Page } from "@playwright/test";
import { ids, injectionText } from "./fixtures";
import type { HarnessCall } from "./harness-actions";

const calls = (page: Page): Promise<HarnessCall[]> => page.evaluate(() => window.__foundationHarness.calls);
const failures = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === baseURL) await route.continue();
    else { errors.push(`Unexpected external request: ${new URL(route.request().url()).origin}`); await route.abort(); }
  });
});

test.afterEach(async ({ page }) => {
  expect(failures.get(page), "No component exceptions or external network requests").toEqual([]);
});

test("command retries retain their request identity, while an edited objective gets a new identity", async ({ page }) => {
  await page.goto("/?scenario=command");
  const objective = page.getByRole("textbox", { name: "Assign Genesis an objective" });
  const key = page.locator('input[name="idempotencyKey"]');
  await objective.fill("Review the neutral synthetic workflow.");
  await expect(key).toHaveValue(ids.request);
  await page.getByRole("button", { name: "Assign work" }).click();
  await expect(page.getByRole("button", { name: "Saving objective" })).toBeDisabled();
  await expect(objective).toBeDisabled();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(objective).toHaveValue("Review the neutral synthetic workflow.");
  await expect(key).toHaveValue(ids.request);

  await page.getByRole("button", { name: "Assign work" }).click();
  await expect(objective).toBeEnabled();
  expect((await calls(page)).map((call) => call.fields.idempotencyKey)).toEqual([ids.request, ids.request]);

  await objective.fill("Review a different neutral workflow.");
  const editedKey = await key.inputValue();
  expect(editedKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(editedKey).not.toBe(ids.request);
  await page.getByRole("button", { name: "Assign work" }).click();
  await expect(objective).toBeEnabled();
  expect((await calls(page))[2]).toEqual({ action: "assign", fields: {
    objective: "Review a different neutral workflow.", idempotencyKey: editedKey, workspaceId: ids.workspace,
  } });
  await page.getByRole("button", { name: "Assign work" }).click();
  await expect(objective).toBeEnabled();
  expect((await calls(page))[3].fields.idempotencyKey).toBe(editedKey);
});

test("task execution sends the specific task once and disables its pending submit button", async ({ page }) => {
  await page.goto("/?scenario=ready");
  await page.getByRole("button", { name: "Run this task", exact: true }).click();
  await expect(page.getByRole("button", { name: "Starting…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Starting…", exact: true })).toHaveAttribute("aria-busy", "true");
  expect(await calls(page)).toEqual([{ action: "run-specialist", fields: { taskId: ids.task } }]);
  await expect(page.getByRole("button", { name: "Run this task", exact: true })).toBeEnabled();
  expect(await calls(page)).toHaveLength(1);
});

test("a dependency blocker disables execution and an exhausted attempt cannot be requeued", async ({ page }) => {
  await page.goto("/?scenario=blocked");
  await expect(page.getByRole("button", { name: "Run this task", exact: true })).toBeDisabled();
  await expect(page.getByText("All dependencies require accepted outputs.")).toBeVisible();
  expect(await calls(page)).toEqual([]);
  await page.goto("/?scenario=failed");
  await expect(page.getByRole("button", { name: "Return to ready queue" })).toBeDisabled();
  await expect(page.getByText("The three-attempt budget is exhausted.")).toBeVisible();
  expect(await calls(page)).toEqual([]);
});

test("acceptance binds the displayed run and bypasses only the optional acceptance note", async ({ page }) => {
  await page.goto("/?scenario=review");
  await expect(page.getByText("Generated · review pending", { exact: true })).toBeVisible();
  const note = page.getByRole("textbox", { name: "Feedback (required for a revision)" });
  await expect(note).toHaveAttribute("required", "");
  await page.getByRole("button", { name: "Accept result", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toHaveCount(2);
  expect(await calls(page)).toEqual([{ action: "review", fields: {
    taskId: ids.task, runId: ids.run, reviewNote: "", decision: "accepted",
  } }]);
  await expect(page.getByRole("button", { name: "Accept result", exact: true })).toBeEnabled();
});

test("a revision requires feedback and submits the exact reviewed run", async ({ page }) => {
  await page.goto("/?scenario=review");
  await page.getByRole("button", { name: "Request revision", exact: true }).click();
  expect(await calls(page)).toEqual([]);
  const note = page.getByRole("textbox", { name: "Feedback (required for a revision)" });
  expect(await note.evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
  await note.fill("Add an observable expected result to step three.");
  await page.getByRole("button", { name: "Request revision", exact: true }).click();
  expect(await calls(page)).toEqual([{ action: "review", fields: {
    taskId: ids.task, runId: ids.run, reviewNote: "Add an observable expected result to step three.", decision: "revision_requested",
  } }]);
  await expect(page.getByRole("button", { name: "Request revision", exact: true })).toBeEnabled();
});

test("review refuses malformed output, missing execution identity, and exhausted revisions", async ({ page }) => {
  await page.goto("/?scenario=invalid");
  await expect(page.getByRole("button", { name: "Accept result", exact: true })).toBeDisabled();
  await expect(page.getByText("The stored output does not satisfy the expected result format.", { exact: false })).toBeVisible();
  await page.goto("/?scenario=missing-run");
  await expect(page.getByRole("button", { name: "Accept result", exact: true })).toHaveCount(0);
  await expect(page.getByText("This result has no execution reference.", { exact: false })).toBeVisible();
  await page.goto("/?scenario=exhausted-review");
  await expect(page.getByRole("button", { name: "Request revision", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Accept result", exact: true })).toBeEnabled();
});

test("authorization submits its decision and task, without crossing into an action outside the harness", async ({ page }) => {
  await page.goto("/?scenario=approval");
  await page.getByRole("textbox", { name: "Decision note" }).fill("Internal neutral work is within scope.");
  await page.getByRole("button", { name: "Authorize work", exact: true }).click();
  expect(await calls(page)).toEqual([{ action: "authorize", fields: {
    taskId: ids.task, reviewNote: "Internal neutral work is within scope.", decision: "approve",
  } }]);
});

test("the Director shows dependencies and requires an explicit plan acceptance", async ({ page }) => {
  await page.goto("/?scenario=director");
  await expect(page.getByText("Plan proposed · review pending", { exact: true })).toBeVisible();
  await expect(page.getByText("After acceptance of: Draft a verification checklist", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept plan", exact: true }).click();
  expect((await calls(page))[0]).toEqual({ action: "review", fields: {
    taskId: ids.task, runId: ids.run, reviewNote: "", decision: "accepted",
  } });
});

test("revision feedback and prior attempt evidence remain inspectable without implying acceptance", async ({ page }) => {
  await page.goto("/?scenario=revision");
  await expect(page.getByText("Revision requested", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Previous result & evidence", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run revision", exact: true })).toBeEnabled();
  await page.getByText("Attempt 1", { exact: true }).click();
  await expect(page.getByText("Add the missing expected result and preserve the earlier evidence.", { exact: false })).toBeVisible();
  const attempt = page.locator("details.foundation-attempt").filter({ hasText: "Attempt 1" });
  await attempt.getByText("Execution details", { exact: true }).click();
  await expect(attempt.getByText(ids.previousRun, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept result", exact: true })).toHaveCount(0);
  await page.goto("/?scenario=legacy");
  await expect(page.getByText("Historical output · acceptance not recorded", { exact: true })).toBeVisible();
});

test("generated text is escaped and its evidence gaps and execution identity are readable", async ({ page }) => {
  await page.goto("/?scenario=review");
  await expect(page.locator(".foundation-prose").filter({ hasText: injectionText })).toBeVisible();
  expect(await page.evaluate(() => window.__fixtureInjected)).toBeUndefined();
  await expect(page.locator(".foundation-result img, .foundation-result script")).toHaveCount(0);
  await expect(page.getByText("Live authentication and production database access are unverified.", { exact: true })).toBeVisible();
  await page.getByText("Execution details", { exact: true }).click();
  await expect(page.getByText(ids.run, { exact: true })).toBeVisible();
  await expect(page.getByText("· self-reported", { exact: true })).toBeVisible();
});

for (const width of [360, 1280]) {
  test(`review and command controls fit a ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const scenario of ["review", "director", "command"]) {
      await page.goto(`/?scenario=${scenario}`);
      await expect(page.getByRole("heading", { name: "Genesis component verification" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${scenario} horizontal overflow`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`${scenario}-${width}.png`), fullPage: true });
    }
  });
}
