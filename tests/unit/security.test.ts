import { describe, expect, it } from "vitest";
import { detectMimeType, sanitizeFilename, validateUpload } from "@/lib/security/file-validation";
import { RateLimiter } from "@/lib/security/rate-limit";
import { can, ROLES } from "@/lib/auth/roles";
import { deriveVerificationToken, hashVerificationToken, isWellFormedToken, verificationUrl } from "@/lib/qr/token";
import { sanitizeAuditMetadata } from "@/lib/audit-metadata";
import { formatDate, maskPassport } from "@/lib/format";
import { computeValidUntil } from "@/lib/reports/validity";

const PDF = new TextEncoder().encode("%PDF-1.7\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

describe("upload validation", () => {
  it("detects real file types from signatures", () => {
    expect(detectMimeType(PDF)).toBe("application/pdf");
    expect(detectMimeType(PNG)).toBe("image/png");
    expect(detectMimeType(JPG)).toBe("image/jpeg");
    expect(detectMimeType(WEBP)).toBe("image/webp");
    expect(detectMimeType(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("rejects oversize, empty, unsupported and mismatched files", () => {
    const max = 1024;
    expect(validateUpload({ name: "a.pdf", size: 2048, type: "application/pdf" }, PDF, { maxBytes: max }).ok).toBe(false);
    expect(validateUpload({ name: "a.pdf", size: 0, type: "application/pdf" }, PDF, { maxBytes: max }).ok).toBe(false);
    expect(validateUpload({ name: "a.exe", size: 10, type: "application/pdf" }, new Uint8Array([0x4d, 0x5a]), { maxBytes: max }).ok).toBe(false);
    expect(validateUpload({ name: "a.png", size: 10, type: "image/png" }, PDF, { maxBytes: max }).ok).toBe(false);
    const ok = validateUpload({ name: "../../etc/passport scan.pdf", size: 10, type: "application/pdf" }, PDF, { maxBytes: max });
    expect(ok).toMatchObject({ ok: true, mimeType: "application/pdf", extension: "pdf", safeName: "passport_scan.pdf" });
  });

  it("sanitises file names", () => {
    expect(sanitizeFilename("..\\..\\<script>.pdf")).toBe("script.pdf");
  });
});

describe("permissions", () => {
  it("encodes the role matrix", () => {
    expect(can("reporting_staff", "reports.create")).toBe(true);
    expect(can("reporting_staff", "reports.approve_issue")).toBe(false);
    expect(can("medical_officer", "reports.approve_issue")).toBe(true);
    expect(can("auditor", "reports.view_medical")).toBe(false);
    expect(can("auditor", "audit.view")).toBe(true);
    expect(can("super_admin", "reports.view_medical")).toBe(false);
    expect(can("org_admin", "users.manage")).toBe(true);
    expect(can(null, "reports.view_metadata")).toBe(false);
    for (const r of ROLES) expect(can(r, "passports.view")).toBe(["org_admin", "medical_officer", "reporting_staff"].includes(r));
  });
});

describe("verification tokens", () => {
  const secret = "x".repeat(48);
  it("are deterministic per (report, nonce), unpredictable and well-formed", () => {
    const t1 = deriveVerificationToken(secret, "report-1", "nonce-a");
    expect(deriveVerificationToken(secret, "report-1", "nonce-a")).toBe(t1);
    expect(deriveVerificationToken(secret, "report-1", "nonce-b")).not.toBe(t1);
    expect(deriveVerificationToken("y".repeat(48), "report-1", "nonce-a")).not.toBe(t1);
    expect(isWellFormedToken(t1)).toBe(true);
    expect(t1).not.toContain("report-1");
    expect(hashVerificationToken(t1)).toMatch(/^[0-9a-f]{64}$/);
    expect(verificationUrl("https://a.example/", t1)).toBe(`https://a.example/verify/${t1}`);
  });

  it("rejects malformed tokens and weak secrets", () => {
    expect(isWellFormedToken("abc")).toBe(false);
    expect(isWellFormedToken("../../etc/passwd" + "a".repeat(27))).toBe(false);
    expect(() => deriveVerificationToken("short", "r", "n")).toThrow();
  });
});

describe("rate limiter", () => {
  it("limits per key within a window", () => {
    let now = 0;
    const l = new RateLimiter(2, 1000, () => now);
    expect(l.check("ip").allowed).toBe(true);
    expect(l.check("ip").allowed).toBe(true);
    expect(l.check("ip").allowed).toBe(false);
    expect(l.check("other").allowed).toBe(true);
    now = 1001;
    expect(l.check("ip").allowed).toBe(true);
  });
});

describe("audit metadata", () => {
  it("drops keys that could carry personal or medical data", () => {
    expect(sanitizeAuditMetadata({ status: "draft", full_name: "X", passport_number: "Y", hiv: "NEGATIVE", changed_fields: ["examination"] })).toEqual({
      status: "draft",
      changed_fields: ["examination"],
    });
  });
});

describe("formatting and validity", () => {
  it("masks passport numbers and formats dates like the reference", () => {
    expect(maskPassport("Z 1234567")).toBe("•••••567");
    expect(formatDate("2026-07-28")).toBe("28/07/2026");
  });

  it("computes 'Valid upto' like the reference (1 year minus a day) and configurable rules", () => {
    expect(computeValidUntil("2026-07-28")).toBe("2027-07-27");
    expect(computeValidUntil("2026-01-31", { amount: 1, unit: "months", subtractOneDay: false })).toBe("2026-02-28");
    expect(computeValidUntil("2026-07-28", { amount: 90, unit: "days", subtractOneDay: false })).toBe("2026-10-26");
    expect(computeValidUntil("2028-02-29")).toBe("2029-02-27");
  });
});
