import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import jsQR from "jsqr";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";
import { SAMPLE_REPORT_DATA } from "../../src/lib/template/sample-data";
import { fill, login, passportPdf, passportPng } from "./helpers";

const hasPdftoppm = spawnSync("pdftoppm", ["-v"]).status === 0;

test.describe.configure({ mode: "serial" });

let reportId = "";
let verifyUrl = "";
let serial = "";

test("sign in → create → passport OCR → review → medical sections → submit for review", async ({ page }) => {
  await login(page, "staffA");
  await page.getByRole("link", { name: "Create new report" }).click();
  await page.getByRole("button", { name: "Start new report" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]+\/edit/);
  reportId = page.url().match(/reports\/([0-9a-f-]+)\/edit/)![1];
  serial = (await page.locator("span.font-mono").first().textContent())!.trim();
  expect(serial).toMatch(/^R-\d+$/);

  // Step 1 — report information
  await fill(page, "report", "destination", "QATAR");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2 — passport upload (image) with mock OCR, review and correction
  await expect(page.getByText("Upload the passport bio-data page")).toBeVisible();
  await page.locator("#passport-file").setInputFiles({ name: "passport.png", mimeType: "image/png", buffer: passportPng() });
  await expect(page.getByText("Review extracted values")).toBeVisible();
  await expect(page.getByText("Development mock OCR")).toBeVisible();
  // Low-confidence value is flagged for review
  await expect(page.locator("#pp-dateOfIssue").locator("xpath=ancestor::div[contains(@class,'border-amber-300')]")).toHaveCount(1);
  const corrections: Record<string, string> = {
    surname: "SAMPLE",
    givenNames: "ARUN KUMAR",
    fullName: "ARUN KUMAR SAMPLE",
    passportNumber: "Z 1234567",
    dateOfBirth: "1995-01-01",
    nationality: "INDIAN",
    placeOfIssue: "CHENNAI",
    dateOfIssue: "2020-01-15",
    dateOfExpiry: "2030-01-14",
  };
  for (const [k, v] of Object.entries(corrections)) await page.locator(`#pp-${k}`).fill(v);
  await page.locator("#pp-sex").selectOption("MALE");
  const confirm = page.getByRole("button", { name: "Confirm and apply to report" });
  await expect(confirm).toBeDisabled(); // explicit attestation required
  await page.getByLabel(/I have compared these values/).check();
  await confirm.click();
  await expect(page.getByText(/Identity details confirmed and applied/)).toBeVisible();

  // Step 3 — identity review: OCR-reviewed values were applied, complete the rest
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("#f-examinee-passport_number")).toHaveValue("Z 1234567");
  await expect(page.locator("#f-examinee-full_name")).toHaveValue("ARUN KUMAR SAMPLE");
  for (const k of ["name_title", "height_cm", "weight_kg", "marital_status", "position_applied_for"] as const) {
    await fill(page, "examinee", k, SAMPLE_REPORT_DATA.examinee[k] as string);
  }

  // Step 4 — medical sections (all entered manually; nothing pre-filled)
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("#f-examination-right_eye")).toHaveValue("");
  await expect(page.locator("#f-laboratory-hiv")).toHaveValue("");
  for (const section of ["history", "examination", "laboratory"] as const) {
    for (const [k, v] of Object.entries(SAMPLE_REPORT_DATA[section])) {
      if (v === null) continue;
      if (section === "laboratory" && (k === "pregnancy_test" || k === "lmp")) continue; // hidden for male examinee
      await fill(page, section, k, v);
    }
  }
  await expect(page.locator("#f-laboratory-pregnancy_test")).toHaveCount(0);
  await fill(page, "remarks", "remarks", SAMPLE_REPORT_DATA.remarks.remarks as string);

  // Step 5 — review: preview + checklist
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("All required fields completed and valid")).toBeVisible();
  await expect(page.frameLocator('iframe[title="Report preview"]').getByText("DRAFT — NOT VALID")).toBeVisible();
  await expect(page.frameLocator('iframe[title="Report preview"]').getByText("ARUN KUMAR SAMPLE")).toBeVisible();

  // Step 6 — submit for review (reporting staff cannot issue)
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("button", { name: "Approve and issue report" })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted for review/)).toBeVisible();
});

test("medical officer issues: A4 PDF → private storage → QR → public verification", async ({ page }) => {
  await login(page, "officerA");
  await page.goto(`/reports/${reportId}/edit`);
  await page.getByRole("button", { name: /Save & generate/ }).click();
  await page.getByRole("button", { name: "Approve and issue report" }).click();
  await page.waitForURL(new RegExp(`/reports/${reportId}\\?issued=1`), { timeout: 60_000 });
  await expect(page.getByText("Report issued")).toBeVisible();
  await expect(page.getByText("Completed").first()).toBeVisible();

  verifyUrl = (await page.getByRole("link", { name: /Open verification page/ }).getAttribute("href"))!;
  expect(verifyUrl).toMatch(/\/verify\/[A-Za-z0-9_-]{43}$/);
  expect(verifyUrl).not.toContain(reportId); // token does not expose the record id

  // Download the stored PDF through the authorised endpoint (redirects to a short-lived signed URL)
  const href = (await page.getByRole("link", { name: "Download PDF" }).getAttribute("href"))!;
  const res = await page.request.get(href);
  expect(res.ok()).toBe(true);
  const pdf = await res.body();
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const doc = await PDFDocument.load(pdf);
  expect(doc.getPageCount()).toBe(1);
  const { width, height } = doc.getPage(0).getSize();
  expect(Math.round(width)).toBe(595);
  expect(Math.round(height)).toBe(842);
  await expect(page.getByRole("link", { name: "Print" }).first()).toHaveAttribute("href", /mode=inline/);

  // The QR code printed in the PDF decodes to the verification URL
  if (hasPdftoppm) {
    const dir = mkdtempSync(join(tmpdir(), "e2e-qr-"));
    writeFileSync(join(dir, "r.pdf"), pdf);
    execFileSync("pdftoppm", ["-r", "200", "-png", "-singlefile", join(dir, "r.pdf"), join(dir, "r")]);
    const png = PNG.sync.read(readFileSync(join(dir, "r.png")));
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(verifyUrl);
  }

  // Public verification page (anonymous browser context)
  const anon = await page.context().browser()!.newContext();
  const pub = await anon.newPage();
  await pub.goto(verifyUrl);
  await expect(pub.locator('[data-verification-result="valid"]')).toBeVisible();
  const text = await pub.locator("main").innerText();
  expect(text).toContain(serial);
  expect(text).toContain("E2E Medical Centre A");
  for (const secret of ["ARUN", "SAMPLE PERSON", "1234567", "01/01/1995", "NEGATIVE", "MECHANICAL"]) expect(text).not.toContain(secret);
  // A scan never grants access to the full report
  await pub.goto(`/reports/${reportId}`);
  await expect(pub).toHaveURL(/\/login/);
  await anon.close();
});

test("issued reports are locked; corrections create a revision that supersedes the original", async ({ page }) => {
  await login(page, "officerA");
  await page.goto(`/reports/${reportId}/edit`);
  await expect(page).toHaveURL(new RegExp(`/reports/${reportId}$`)); // edit redirects to detail when issued

  await page.getByRole("button", { name: /Create correction/ }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]+\/edit/);
  const revisionId = page.url().match(/reports\/([0-9a-f-]+)\/edit/)![1];
  expect(revisionId).not.toBe(reportId);
  await expect(page.getByText("Revision 2")).toBeVisible();
  await page.getByRole("button", { name: /Medical examination/ }).click();
  await fill(page, "remarks", "remarks", "NO ABNORMALITY DETECTED. CORRECTED COPY.");
  await page.getByRole("button", { name: /Save & generate/ }).click();
  await page.getByRole("button", { name: "Approve and issue report" }).click();
  await page.waitForURL(new RegExp(`/reports/${revisionId}\\?issued=1`), { timeout: 60_000 });
  const revisionVerify = (await page.getByRole("link", { name: /Open verification page/ }).getAttribute("href"))!;
  expect(revisionVerify).not.toBe(verifyUrl);

  const pub = await (await page.context().browser()!.newContext()).newPage();
  await pub.goto(verifyUrl);
  await expect(pub.locator('[data-verification-result="superseded"]')).toBeVisible();
  await pub.goto(revisionVerify);
  await expect(pub.locator('[data-verification-result="valid"]')).toBeVisible();

  // Revoke the revision → its QR shows revoked
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByLabel(/Reason for revocation/).fill("Issued in error during E2E test");
  await page.getByRole("button", { name: "Confirm revocation" }).click();
  await expect(page.getByText("Revoked").first()).toBeVisible();
  await pub.goto(revisionVerify);
  await expect(pub.locator('[data-verification-result="revoked"]')).toBeVisible();
});

test("PDF passport upload and manual identity entry path", async ({ page }) => {
  await login(page, "staffA");
  await page.goto("/reports/new");
  await page.getByRole("button", { name: "Start new report" }).click();
  await page.waitForURL(/\/edit/);
  await page.getByRole("button", { name: /Passport upload/ }).click();
  await page.locator("#passport-file").setInputFiles({ name: "passport.pdf", mimeType: "application/pdf", buffer: await passportPdf() });
  await expect(page.getByText("Review extracted values")).toBeVisible();
  // Choose manual entry instead of confirming the OCR result
  await page.getByRole("button", { name: "Enter details manually" }).first().click();
  await expect(page.getByText("Identity not yet confirmed")).toBeVisible();
  await fill(page, "examinee", "full_name", "MANUAL ENTRY PERSON");
  await fill(page, "examinee", "passport_number", "M1234567");
  await page.getByRole("button", { name: "Confirm identity entered manually" }).click();
  await expect(page.getByText(/confirmed as manually entered/)).toBeVisible();
  // Invalid upload is rejected by signature checks
  await page.getByRole("button", { name: /Passport upload/ }).click();
  await page.locator("#passport-file").setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>not a pdf</html>") });
  await expect(page.getByText(/Unsupported file/)).toBeVisible();
});

test("dashboard statistics, search and listing reflect database records", async ({ page }) => {
  await login(page, "staffA");
  await expect(page.getByText("Total reports")).toBeVisible();
  await page.goto(`/reports?q=${encodeURIComponent("ARUN KUMAR")}`);
  await expect(page.getByRole("cell", { name: "ARUN KUMAR SAMPLE" }).first()).toBeVisible();
  await expect(page.getByText("•••••567").first()).toBeVisible(); // masked passport number
  await page.goto(`/reports?q=Z1234567`);
  await expect(page.getByRole("cell", { name: "ARUN KUMAR SAMPLE" }).first()).toBeVisible();
  await page.goto(`/reports?status=revoked`);
  await expect(page.getByRole("cell", { name: "ARUN KUMAR SAMPLE" }).first()).toBeVisible();
});
