import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { login, stack } from "./helpers";

let foreignReportId = "";

test.beforeAll(async () => {
  // Create a draft in organisation A directly through the API as staffA.
  const s = stack();
  const sb = createClient(s.supabaseUrl, s.anonKey, { auth: { persistSession: false } });
  await sb.auth.signInWithPassword({ email: s.users.staffA.email, password: s.users.staffA.password });
  const { data, error } = await sb.from("reports").insert({ organisation_id: s.organisations.A, template_version: 1, examinee_details: { full_name: "ISOLATION TEST" } }).select("id").single();
  if (error) throw error;
  foreignReportId = data.id;
});

test("anonymous users are redirected to sign in and APIs refuse them", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const api = await request.get(`/api/reports/${foreignReportId}/preview`, { maxRedirects: 0 });
  expect(api.status()).toBe(401);
});

test("users cannot open another organisation's report by changing the URL", async ({ page }) => {
  await login(page, "staffB");
  const res = await page.goto(`/reports/${foreignReportId}`);
  expect(res?.status()).toBe(404);
  const preview = await page.request.get(`/api/reports/${foreignReportId}/preview`);
  expect(preview.status()).toBe(404);
  const docs = await page.request.post(`/api/reports/${foreignReportId}/documents`, { multipart: { kind: "passport", file: { name: "p.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) } } });
  expect(docs.status()).toBe(404);
  await page.goto("/reports?q=ISOLATION");
  await expect(page.getByText("No reports found.")).toBeVisible();
});

test("auditors see metadata only and cannot reach medical content", async ({ page }) => {
  await login(page, "auditorA");
  await page.goto(`/reports/${foreignReportId}`);
  await expect(page.getByText(/Metadata only/)).toBeVisible();
  const preview = await page.request.get(`/api/reports/${foreignReportId}/preview`);
  expect(preview.status()).toBe(403);
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit logs" })).toBeVisible();
  await expect(page.getByText("report.created").first()).toBeVisible();
  await page.goto("/reports/new");
  await expect(page).toHaveURL(/denied=1/);
});

test("reporting staff cannot reach administration pages", async ({ page }) => {
  await login(page, "staffA");
  for (const path of ["/users", "/settings/organisation", "/settings/templates", "/audit"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/denied=1/);
  }
});

test("invalid verification tokens fail safely", async ({ page }) => {
  await page.goto("/verify/not-a-token");
  await expect(page.locator('[data-verification-result="not_found"]')).toBeVisible();
  await page.goto(`/verify/${"A".repeat(43)}`);
  await expect(page.locator('[data-verification-result="not_found"]')).toBeVisible();
});

test("organisation administrators can configure the organisation and see users", async ({ page }) => {
  await login(page, "adminA");
  await page.goto("/settings/organisation");
  await page.getByLabel("Registration number").fill("TN 77/2011");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.goto("/users");
  await expect(page.getByRole("cell", { name: "staffA", exact: true })).toBeVisible();
  await page.goto("/settings/templates");
  await page.getByRole("button", { name: "Preview with sample data" }).click();
  await expect(page.frameLocator('iframe[title="Template preview"]').getByText("SAMPLE DATA")).toBeVisible();
});
