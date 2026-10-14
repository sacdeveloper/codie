// Builds and starts the app against the local E2E stack (env from tests/.artifacts/e2e.env).
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

if (!existsSync("tests/.artifacts/e2e.env")) {
  console.error("tests/.artifacts/e2e.env not found. Start the local stack first (`npm run e2e:stack`) and wait for “ready”.");
  process.exit(1);
}
const env = { ...process.env, NEXT_DIST_DIR: ".next-e2e", NEXT_TELEMETRY_DISABLED: "1" };
for (const line of readFileSync("tests/.artifacts/e2e.env", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
if (!process.env.E2E_SKIP_BUILD) {
  const b = spawnSync("npx", ["next", "build"], { env, stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}
const s = spawn("npx", ["next", "start", "-p", "3100"], { env, stdio: "inherit" });
process.on("SIGTERM", () => s.kill("SIGTERM"));
process.on("SIGINT", () => s.kill("SIGINT"));
