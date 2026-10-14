/**
 * Starts a throwaway PostgreSQL cluster (or uses TEST_DATABASE_URL), loads the Supabase stubs
 * and applies every migration in supabase/migrations in order.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";

const ROOT = resolve(__dirname, "../..");
let dataDir: string | null = null;
let pgBin = "";

function findPgBin(): string {
  const candidates = ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/opt/homebrew/bin", "/usr/local/bin"];
  for (const c of candidates) if (existsSync(join(c, "pg_ctl"))) return c;
  throw new Error("PostgreSQL server binaries not found; set TEST_DATABASE_URL instead.");
}

function run(cmd: string, args: string[]) {
  const asRoot = process.getuid?.() === 0;
  const res = asRoot ? spawnSync("runuser", ["-u", "postgres", "--", cmd, ...args], { encoding: "utf8" }) : spawnSync(cmd, args, { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`${cmd} failed: ${res.stderr || res.stdout}`);
  return res.stdout;
}

export async function setup() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    pgBin = findPgBin();
    dataDir = mkdtempSync(join(tmpdir(), "codie-pg-"));
    chmodSync(dataDir, 0o777);
    const port = 54000 + Math.floor(Math.random() * 900);
    run(join(pgBin, "initdb"), ["-D", join(dataDir, "data"), "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
    run(join(pgBin, "pg_ctl"), ["-D", join(dataDir, "data"), "-o", `-p ${port} -k ${dataDir} -c listen_addresses=''`, "-w", "-l", join(dataDir, "log"), "start"]);
    url = `postgresql://postgres@/postgres?host=${encodeURIComponent(dataDir)}&port=${port}`;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(readFileSync(join(ROOT, "tests/db/supabase-stubs.sql"), "utf8"));
  const dir = join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    try {
      await client.query(readFileSync(join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
  }
  await client.end();
  process.env.TEST_DATABASE_URL = url;
  return async () => {
    if (dataDir) {
      try {
        run(join(pgBin, "pg_ctl"), ["-D", join(dataDir, "data"), "-m", "immediate", "stop"]);
      } catch {
        /* ignore */
      }
      rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

export function provide() {}
void execFileSync;
