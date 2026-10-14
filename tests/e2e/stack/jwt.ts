import { createHmac, timingSafeEqual } from "node:crypto";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token: string, secret: string): Record<string, unknown> | null {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const actual = Buffer.from(s, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;
  return payload;
}
