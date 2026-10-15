import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10),
});

const serverSchema = publicSchema.extend({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),
  VERIFICATION_TOKEN_SECRET: z.string().min(32, "VERIFICATION_TOKEN_SECRET must be at least 32 characters"),
  OCR_PROVIDER: z.enum(["azure", "mock"]).default("mock"),
  OCR_MOCK_MODE: z.enum(["specimen", "fail"]).default("specimen"),
  ALLOW_MOCK_OCR_IN_PRODUCTION: bool,
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: z.string().optional(),
  AZURE_DOCUMENT_INTELLIGENCE_KEY: z.string().optional(),
  AZURE_DOCUMENT_INTELLIGENCE_API_VERSION: z.string().default("2024-11-30"),
  PASSPORT_MAX_FILE_MB: z.coerce.number().positive().max(50).default(10),
  PDF_CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
  RATE_LIMIT_VERIFY_PER_MINUTE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_UPLOAD_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/** On Vercel, fall back to the project's production domain when NEXT_PUBLIC_APP_URL is not set. */
function withPlatformDefaults(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!env.NEXT_PUBLIC_APP_URL && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return { ...env, NEXT_PUBLIC_APP_URL: `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` };
  }
  return env;
}

/** Server-only environment. Throws a descriptive (non-secret) error when misconfigured. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(withPlatformDefaults(process.env));
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment configuration: ${names}`);
  }
  cached = parsed.data;
  return cached;
}

/** Values safe to use in the browser. Next.js inlines NEXT_PUBLIC_* at build time. */
export const publicEnv = {
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};
