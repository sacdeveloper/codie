import type { Metadata } from "next";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import { clientKeyFromHeaders, getLimiter } from "@/lib/security/rate-limit";
import { verifyToken, type VerificationResult } from "@/lib/verification";
import { VerificationResultCard } from "@/components/verification-result";

export const metadata: Metadata = { title: "Report verification", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Public QR landing page. Shows only the minimum needed to confirm authenticity.
 * It never grants access to the medical report, which requires an authenticated session.
 */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientKeyFromHeaders(await headers());
  let result: VerificationResult;
  let limited = false;
  if (!getLimiter("verify", serverEnv().RATE_LIMIT_VERIFY_PER_MINUTE).check(ip).allowed) {
    limited = true;
    result = { result: "unavailable" };
  } else {
    result = await verifyToken(token);
  }
  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-widest text-brand-700 uppercase">Medical report verification</p>
          <h1 className="mt-1 text-xl font-semibold">Document authenticity check</h1>
        </div>
        {limited && <p className="rounded-md bg-amber-50 p-3 text-center text-sm text-amber-900">Too many verification requests. Please wait a minute and try again.</p>}
        <VerificationResultCard result={result} />
        <p className="text-center text-xs text-slate-500">
          This page confirms whether a report was issued and is still valid. It does not display medical results or personal data.
          Authorised staff can view the full report after signing in.
        </p>
      </div>
    </main>
  );
}
