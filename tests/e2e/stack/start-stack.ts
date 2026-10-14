/**
 * LOCAL E2E STACK (test harness only — production uses a real Supabase project).
 *
 * Starts PostgreSQL, GoTrue (Supabase Auth) and PostgREST from official release binaries,
 * plus a small gateway/storage shim, applies supabase/migrations, seeds two organisations and
 * users, and writes the connection details to tests/.artifacts/e2e-stack.json.
 *
 *   npx tsx tests/e2e/stack/start-stack.ts        (keeps running until Ctrl+C)
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { DEFAULT_TEMPLATE } from "../../../src/lib/template/default-template";
import { signJwt } from "./jwt";
import { startGateway } from "./gateway";

const ROOT = resolve(import.meta.dirname, "../../..");
const ART = join(ROOT, "tests/.artifacts");
const BIN = join(ART, "stack-bin");
const RUN = join(ART, "stack-run");
const PG_PORT = 54322;
const AUTH_PORT = 54329;
const REST_PORT = 54330;
const GATEWAY_PORT = 54321;
const JWT_SECRET = "local-e2e-jwt-secret-not-for-production-0123456789";
const APP_URL = process.env.E2E_APP_URL ?? "http://localhost:3100";
const DB_URL = `postgresql://postgres@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`;
const PASSWORD = "E2e-Password-123!";

const children: ChildProcess[] = [];
const log = (...a: unknown[]) => console.log("[e2e-stack]", ...a);

function pgBin(): string {
  for (const v of ["17", "16", "15"]) if (existsSync(`/usr/lib/postgresql/${v}/bin/pg_ctl`)) return `/usr/lib/postgresql/${v}/bin`;
  throw new Error("PostgreSQL server binaries not found");
}

function asPostgres(cmd: string, args: string[]) {
  const root = process.getuid?.() === 0;
  const r = root ? spawnSync("runuser", ["-u", "postgres", "--", cmd, ...args], { encoding: "utf8" }) : spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd}: ${r.stderr || r.stdout}`);
}

function download(url: string, out: string) {
  const r = spawnSync("curl", ["-sSfL", "-o", out, url], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`download failed: ${url}`);
}

function ensureBinaries() {
  mkdirSync(BIN, { recursive: true });
  if (!existsSync(join(BIN, "postgrest"))) {
    log("downloading PostgREST…");
    download("https://github.com/PostgREST/postgrest/releases/download/v12.2.12/postgrest-v12.2.12-linux-static-x86-64.tar.xz", join(BIN, "pgrst.tar.xz"));
    spawnSync("tar", ["xf", "pgrst.tar.xz"], { cwd: BIN });
  }
  if (!existsSync(join(BIN, "auth"))) {
    log("downloading GoTrue (Supabase Auth)…");
    download("https://github.com/supabase/auth/releases/download/v2.177.0/auth-v2.177.0-x86.tar.gz", join(BIN, "auth.tar.gz"));
    spawnSync("tar", ["xzf", "auth.tar.gz"], { cwd: BIN });
  }
}

async function waitFor(url: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timeout waiting for ${url}`);
}

function run(name: string, cmd: string, args: string[], env: Record<string, string>, cwd?: string) {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d) => process.env.E2E_STACK_VERBOSE && process.stdout.write(`[${name}] ${d}`));
  child.stderr?.on("data", (d) => process.env.E2E_STACK_VERBOSE && process.stderr.write(`[${name}] ${d}`));
  child.on("exit", (code) => code && log(`${name} exited with ${code}`));
  children.push(child);
  return child;
}

async function main() {
  ensureBinaries();
  const bin = pgBin();
  rmSync(RUN, { recursive: true, force: true });
  mkdirSync(RUN, { recursive: true });
  chmodSync(RUN, 0o777);

  log("starting PostgreSQL…");
  asPostgres(join(bin, "initdb"), ["-D", join(RUN, "pg"), "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  asPostgres(join(bin, "pg_ctl"), ["-D", join(RUN, "pg"), "-o", `-p ${PG_PORT} -k ${RUN} -c listen_addresses=127.0.0.1`, "-w", "-l", join(RUN, "pg.log"), "start"]);
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  // Mirrors Supabase: GoTrue connects as supabase_auth_admin whose search_path is the auth schema.
  await db.query(`create extension if not exists pgcrypto;
    create role supabase_auth_admin login superuser;
    alter role supabase_auth_admin set search_path = auth;
    create schema if not exists auth authorization supabase_auth_admin;`);

  log("starting GoTrue…");
  run("auth", join(BIN, "auth"), [], {
    GOTRUE_API_HOST: "127.0.0.1",
    PORT: String(AUTH_PORT),
    API_EXTERNAL_URL: `http://127.0.0.1:${GATEWAY_PORT}/auth/v1`,
    GOTRUE_DB_DRIVER: "postgres",
    DATABASE_URL: `postgresql://supabase_auth_admin@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`,
    GOTRUE_DB_NAMESPACE: "auth",
    GOTRUE_DB_MIGRATIONS_PATH: join(BIN, "migrations"),
    GOTRUE_SITE_URL: APP_URL,
    GOTRUE_JWT_SECRET: JWT_SECRET,
    GOTRUE_JWT_EXP: "3600",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_DISABLE_SIGNUP: "true",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "1000",
    GOTRUE_LOG_LEVEL: "warn",
  });
  await waitFor(`http://127.0.0.1:${AUTH_PORT}/health`);

  log("applying platform SQL and migrations…");
  await db.query(readFileSync(join(import.meta.dirname, "platform.sql"), "utf8"));
  const migDir = join(ROOT, "supabase/migrations");
  for (const f of readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) await db.query(readFileSync(join(migDir, f), "utf8"));

  log("starting PostgREST…");
  run("rest", join(BIN, "postgrest"), [], {
    PGRST_DB_URI: `postgresql://authenticator:authenticator@127.0.0.1:${PG_PORT}/postgres`,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_PORT: String(REST_PORT),
    PGRST_SERVER_HOST: "127.0.0.1",
  });
  await waitFor(`http://127.0.0.1:${REST_PORT}/`);

  startGateway({ port: GATEWAY_PORT, authPort: AUTH_PORT, restPort: REST_PORT, jwtSecret: JWT_SECRET, databaseUrl: DB_URL, dataDir: join(RUN, "storage") });
  await waitFor(`http://127.0.0.1:${GATEWAY_PORT}/health`);

  const far = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  const anonKey = signJwt({ role: "anon", iss: "supabase-e2e", exp: far }, JWT_SECRET);
  const serviceKey = signJwt({ role: "service_role", iss: "supabase-e2e", exp: far }, JWT_SECRET);

  log("seeding organisations and users…");
  const orgs: Record<string, string> = {};
  for (const [key, name, decl] of [["A", "E2E Medical Centre A", "E2E DIAGNOSTIC CENTRE A"], ["B", "E2E Medical Centre B", "E2E DIAGNOSTIC CENTRE B"]]) {
    const { rows } = await db.query(
      "insert into public.organisations (name, declaration_name, registration_number, footer_lines) values ($1, $2, 'TN 00/0000', array['www.example.com','info@example.com']) returning id",
      [name, decl],
    );
    orgs[key] = rows[0].id;
    await db.query(
      "insert into public.report_templates (organisation_id, name, version, field_configuration, letterhead_configuration, layout_configuration, is_active) values ($1, $2, 1, $3, $4, $5, true)",
      [rows[0].id, DEFAULT_TEMPLATE.name, DEFAULT_TEMPLATE.fieldConfiguration, DEFAULT_TEMPLATE.letterheadConfiguration, DEFAULT_TEMPLATE.layoutConfiguration],
    );
  }
  const users: Record<string, { email: string; password: string; id: string }> = {};
  for (const [key, org, role] of [
    ["staffA", "A", "reporting_staff"],
    ["officerA", "A", "medical_officer"],
    ["adminA", "A", "org_admin"],
    ["auditorA", "A", "auditor"],
    ["staffB", "B", "reporting_staff"],
  ] as const) {
    const email = `${key.toLowerCase()}@e2e.test`;
    const r = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: key } }),
    });
    const u = await r.json();
    if (!r.ok) throw new Error(`createUser failed: ${JSON.stringify(u)}`);
    await db.query("update public.profiles set organisation_id = $2, role = $3, is_active = true, full_name = $4 where id = $1", [u.id, orgs[org], role, key]);
    users[key] = { email, password: PASSWORD, id: u.id };
  }
  await db.end();

  const info = { supabaseUrl: `http://127.0.0.1:${GATEWAY_PORT}`, anonKey, serviceKey, jwtSecret: JWT_SECRET, appUrl: APP_URL, organisations: orgs, users };
  writeFileSync(join(ART, "e2e-stack.json"), JSON.stringify(info, null, 2));
  writeFileSync(
    join(ART, "e2e.env"),
    [
      `NEXT_PUBLIC_APP_URL=${APP_URL}`,
      `NEXT_PUBLIC_SUPABASE_URL=${info.supabaseUrl}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
      `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
      "VERIFICATION_TOKEN_SECRET=local-e2e-verification-secret-0123456789abcdef",
      "OCR_PROVIDER=mock",
      // `next start` runs in production mode; the mock provider must be explicitly allowed there.
      "ALLOW_MOCK_OCR_IN_PRODUCTION=true",
      "",
    ].join("\n"),
  );
  log(`ready — gateway ${info.supabaseUrl}`);
}

function shutdown() {
  for (const c of children) c.kill("SIGTERM");
  try {
    asPostgres(join(pgBin(), "pg_ctl"), ["-D", join(RUN, "pg"), "-m", "immediate", "stop"]);
  } catch {
    /* ignore */
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error(e);
  shutdown();
});
