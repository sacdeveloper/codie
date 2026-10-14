export const ALLOWED_UPLOAD_TYPES = {
  "image/jpeg": { ext: "jpg", label: "JPEG" },
  "image/png": { ext: "png", label: "PNG" },
  "image/webp": { ext: "webp", label: "WebP" },
  "application/pdf": { ext: "pdf", label: "PDF" },
} as const;
export type AllowedMimeType = keyof typeof ALLOWED_UPLOAD_TYPES;

/** Detects the real file type from its leading bytes ("magic numbers"). */
export function detectMimeType(bytes: Uint8Array): AllowedMimeType | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP"
  )
    return "image/webp";
  if (b.length >= 5 && String.fromCharCode(b[0], b[1], b[2], b[3], b[4]) === "%PDF-") return "application/pdf";
  return null;
}

export interface UploadValidationOptions {
  maxBytes: number;
  allowed?: AllowedMimeType[];
}

export type UploadValidationResult =
  | { ok: true; mimeType: AllowedMimeType; extension: string; safeName: string }
  | { ok: false; error: string };

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-100);
  return cleaned || "upload";
}

export function validateUpload(
  file: { name: string; size: number; type: string },
  head: Uint8Array,
  opts: UploadValidationOptions,
): UploadValidationResult {
  const allowed = opts.allowed ?? (Object.keys(ALLOWED_UPLOAD_TYPES) as AllowedMimeType[]);
  if (file.size <= 0) return { ok: false, error: "The file is empty." };
  if (file.size > opts.maxBytes) {
    return { ok: false, error: `The file is larger than ${Math.round(opts.maxBytes / 1024 / 1024)} MB.` };
  }
  const detected = detectMimeType(head);
  if (!detected || !allowed.includes(detected)) {
    return { ok: false, error: `Unsupported file. Upload ${allowed.map((a) => ALLOWED_UPLOAD_TYPES[a].label).join(", ")}.` };
  }
  // The browser-declared type must agree with the content (blocks renamed/polyglot files).
  if (file.type && file.type !== detected && !(file.type === "image/jpg" && detected === "image/jpeg")) {
    return { ok: false, error: "The file content does not match its declared type." };
  }
  return { ok: true, mimeType: detected, extension: ALLOWED_UPLOAD_TYPES[detected].ext, safeName: sanitizeFilename(file.name) };
}
