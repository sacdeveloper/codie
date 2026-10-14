import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";

export interface StackInfo {
  supabaseUrl: string;
  anonKey: string;
  organisations: Record<string, string>;
  users: Record<string, { email: string; password: string; id: string }>;
}

export const stack = (): StackInfo => JSON.parse(readFileSync("tests/.artifacts/e2e-stack.json", "utf8"));

export async function login(page: Page, user: keyof StackInfo["users"] | string) {
  const u = stack().users[user];
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}

/** A synthetic "passport scan" image. The mock OCR provider never reads it. */
export function passportPng(): Buffer {
  const png = new PNG({ width: 64, height: 40 });
  png.data.fill(200);
  return PNG.sync.write(png);
}

export async function passportPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 297]);
  page.drawText("SPECIMEN PASSPORT (TEST FIXTURE)", { x: 20, y: 250, size: 14 });
  return Buffer.from(await doc.save());
}

export async function fill(page: Page, section: string, key: string, value: string | number) {
  const el = page.locator(`#f-${section}-${key}`);
  await expect(el).toBeVisible();
  if ((await el.evaluate((n) => n.tagName)) === "SELECT") await el.selectOption(String(value));
  else await el.fill(String(value));
}
