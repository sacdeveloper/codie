import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 794, height: 1123 } });
await p.setContent(readFileSync(process.argv[2], "utf8"));
await p.emulateMedia({ media: "print" });
const r = await p.evaluate(() => {
  const out = [];
  const c = document.getElementById("content"), pg = document.getElementById("page");
  out.push(["content", c.scrollHeight, c.clientHeight], ["page", pg.scrollHeight, pg.clientHeight]);
  document.querySelectorAll("[data-fit], td, .val, .remarks .v").forEach((el) => {
    const w = el.scrollWidth - el.clientWidth - 1, h = el.scrollHeight - el.clientHeight - 1;
    if (w > 0 || h > 0) out.push([el.className, el.textContent.slice(0, 40), w, h]);
  });
  return out;
});
console.log(JSON.stringify(r, null, 1));
await p.screenshot({ path: process.argv[3], fullPage: true });
await b.close();
