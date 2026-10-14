/**
 * LOCAL E2E HARNESS ONLY. A tiny API gateway emulating Supabase's routing:
 *   /auth/v1/*    -> GoTrue
 *   /rest/v1/*    -> PostgREST
 *   /storage/v1/* -> storage shim (below)
 * The storage shim authorises every request the way Supabase Storage does: it runs the
 * storage.objects query as the caller's JWT role so the project's storage RLS policies apply.
 */
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import pg from "pg";
import { signJwt, verifyJwt } from "./jwt";

export interface GatewayOptions {
  port: number;
  authPort: number;
  restPort: number;
  jwtSecret: string;
  databaseUrl: string;
  dataDir: string;
}

function proxy(req: IncomingMessage, res: ServerResponse, port: number, path: string) {
  const upstream = httpRequest({ host: "127.0.0.1", port, path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => {
    res.writeHead(502).end();
  });
  req.pipe(upstream);
}

const body = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const json = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data));
};
const storageError = (res: ServerResponse, status: number, error: string, message: string) => json(res, status === 404 ? 400 : status, { statusCode: String(status), error, message });

export function startGateway(o: GatewayOptions) {
  const pool = new pg.Pool({ connectionString: o.databaseUrl, max: 10 });

  async function asCaller<T>(claims: Record<string, unknown>, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const role = claims.role === "service_role" ? "service_role" : claims.role === "authenticated" ? "authenticated" : "anon";
      await c.query(`set local role ${role}`);
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  async function storage(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
    const m = path.match(/^\/object\/(sign\/|authenticated\/|public\/)?([^/]+)\/(.+)$/);
    if (!m) return storageError(res, 404, "not_found", "Unknown storage route");
    const [, kind, bucket, rawName] = m;
    const name = decodeURIComponent(rawName);
    const file = join(o.dataDir, bucket, name);

    // Signed URL download (no Authorization header; token carries the grant).
    if (kind === "sign/" && req.method === "GET") {
      const grant = verifyJwt(query.get("token") ?? "", o.jwtSecret);
      if (!grant || grant.url !== `${bucket}/${name}` || !existsSync(file)) return storageError(res, 400, "InvalidJWT", "Invalid or expired signature");
      const meta = JSON.parse(readFileSync(`${file}.meta.json`, "utf8"));
      const headers: Record<string, string> = { "content-type": meta.contentType };
      const dl = query.get("download");
      if (dl !== null) headers["content-disposition"] = `attachment; filename="${dl || name.split("/").pop()}"`;
      res.writeHead(200, headers);
      return res.end(readFileSync(file));
    }

    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const claims = verifyJwt(token, o.jwtSecret);
    if (!claims) return storageError(res, 400, "InvalidJWT", "Invalid JWT");

    try {
      if (req.method === "POST" && kind === "sign/") {
        const { expiresIn } = JSON.parse((await body(req)).toString() || "{}");
        const found = await asCaller(claims, (c) => c.query("select id from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
        if (!found.rowCount) return storageError(res, 404, "not_found", "Object not found");
        const t = signJwt({ url: `${bucket}/${name}`, exp: Math.floor(Date.now() / 1000) + Number(expiresIn ?? 60) }, o.jwtSecret);
        return json(res, 200, { signedURL: `/object/sign/${bucket}/${rawName}?token=${t}` });
      }
      if (req.method === "POST" && !kind) {
        const data = await body(req);
        const contentType = String(req.headers["content-type"] ?? "application/octet-stream");
        const b = await pool.query("select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
        if (!b.rowCount) return storageError(res, 404, "not_found", "Bucket not found");
        if (b.rows[0].file_size_limit && data.length > Number(b.rows[0].file_size_limit)) return storageError(res, 413, "Payload too large", "The object exceeded the maximum allowed size");
        if (b.rows[0].allowed_mime_types && !b.rows[0].allowed_mime_types.includes(contentType)) return storageError(res, 415, "invalid_mime_type", `mime type ${contentType} is not supported`);
        await asCaller(claims, (c) => c.query("insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)", [bucket, name, claims.sub ?? null, { size: data.length, mimetype: contentType }]));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, data);
        writeFileSync(`${file}.meta.json`, JSON.stringify({ contentType }));
        return json(res, 200, { Key: `${bucket}/${name}`, Id: name });
      }
      if (req.method === "GET") {
        const found = await asCaller(claims, (c) => c.query("select id from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
        if (!found.rowCount || !existsSync(file)) return storageError(res, 404, "not_found", "Object not found");
        const meta = JSON.parse(readFileSync(`${file}.meta.json`, "utf8"));
        res.writeHead(200, { "content-type": meta.contentType });
        return res.end(readFileSync(file));
      }
      return storageError(res, 405, "method_not_allowed", "Not supported by the E2E storage shim");
    } catch (e) {
      const msg = (e as Error).message;
      if (/duplicate key/.test(msg)) return storageError(res, 409, "Duplicate", "The resource already exists");
      if (/row-level security|permission denied/.test(msg)) return storageError(res, 403, "Unauthorized", "new row violates row-level security policy");
      return storageError(res, 500, "internal", "Storage error");
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    if (url.pathname.startsWith("/auth/v1/")) return proxy(req, res, o.authPort, url.pathname.slice("/auth/v1".length) + url.search);
    if (url.pathname.startsWith("/rest/v1/")) return proxy(req, res, o.restPort, url.pathname.slice("/rest/v1".length) + url.search);
    if (url.pathname.startsWith("/storage/v1/")) return void storage(req, res, url.pathname.slice("/storage/v1".length), url.searchParams);
    res.writeHead(404).end();
  });
  server.listen(o.port, "127.0.0.1");
  return { close: () => new Promise<void>((r) => server.close(() => pool.end().then(() => r()))) };
}
