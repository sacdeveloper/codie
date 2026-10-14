import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/errors";

export const BUCKETS = {
  passports: "passport-documents",
  reports: "generated-reports",
  assets: "organisation-assets",
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

/** All object paths start with the organisation id; storage RLS policies depend on it. */
export const paths = {
  passport: (org: string, report: string, docId: string, ext: string) => `${org}/${report}/passport/${docId}.${ext}`,
  photo: (org: string, report: string, docId: string, ext: string) => `${org}/${report}/photo/${docId}.${ext}`,
  reportPdf: (org: string, report: string, version: number) => `${org}/${report}/reports/report-v${version}-${randomBytes(3).toString("hex")}.pdf`,
  /** Assets are content-addressed and never overwritten, so issued snapshots stay reproducible. */
  asset: (org: string, kind: "logo" | "letterhead" | "signature" | "seal", hash: string, ext: string) => `${org}/letterhead/${kind}-${hash.slice(0, 16)}.${ext}`,
};

export async function uploadPrivate(supabase: SupabaseServerClient, bucket: Bucket, path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: false, cacheControl: "private, max-age=0" });
  if (error && !/exists|Duplicate/i.test(error.message)) throw new UserFacingError("The file could not be stored. Please try again.", "storage_error", 502);
}

export async function downloadBytes(supabase: SupabaseServerClient, bucket: Bucket, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new UserFacingError("The stored file could not be read.", "storage_error", 502);
  return new Uint8Array(await data.arrayBuffer());
}

export async function downloadAsDataUrl(supabase: SupabaseServerClient, bucket: Bucket, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const bytes = await downloadBytes(supabase, bucket, path);
    const ext = path.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Short-lived signed URL (default 60 s) for an authorised user. */
export async function signedUrl(supabase: SupabaseServerClient, bucket: Bucket, path: string, opts: { seconds?: number; download?: string | false } = {}) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, opts.seconds ?? 60, opts.download ? { download: opts.download } : undefined);
  if (error || !data) throw new UserFacingError("The file is not available.", "storage_error", 404);
  return data.signedUrl;
}
