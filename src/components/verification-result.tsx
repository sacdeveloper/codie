import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Clock } from "lucide-react";
import type { VerificationResult } from "@/lib/verification";
import { formatDate } from "@/lib/format";

const VIEW = {
  valid: { icon: CheckCircle2, title: "Authentic report — valid", tone: "border-green-300 bg-green-50 text-green-900", iconTone: "text-green-600" },
  expired: { icon: Clock, title: "Authentic report — validity period has ended", tone: "border-amber-300 bg-amber-50 text-amber-900", iconTone: "text-amber-600" },
  revoked: { icon: XCircle, title: "This report has been revoked", tone: "border-red-300 bg-red-50 text-red-900", iconTone: "text-red-600" },
  superseded: { icon: AlertTriangle, title: "Superseded by a newer version of this report", tone: "border-purple-300 bg-purple-50 text-purple-900", iconTone: "text-purple-600" },
  not_found: { icon: HelpCircle, title: "No report matches this code", tone: "border-slate-300 bg-slate-50 text-slate-900", iconTone: "text-slate-500" },
  unavailable: { icon: HelpCircle, title: "Verification is temporarily unavailable", tone: "border-slate-300 bg-slate-50 text-slate-900", iconTone: "text-slate-500" },
} as const;

export function VerificationResultCard({ result }: { result: VerificationResult }) {
  const v = VIEW[result.result];
  const Icon = v.icon;
  return (
    <div className={`rounded-lg border-2 p-6 ${v.tone}`} data-verification-result={result.result}>
      <div className="flex items-center gap-3">
        <Icon className={`size-8 shrink-0 ${v.iconTone}`} />
        <h2 className="text-lg font-semibold">{v.title}</h2>
      </div>
      {"reference" in result ? (
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs uppercase opacity-70">Report reference</dt><dd className="font-mono font-semibold">{result.reference}{result.revision > 1 ? ` (rev. ${result.revision})` : ""}</dd></div>
          <div><dt className="text-xs uppercase opacity-70">Issuing organisation</dt><dd className="font-semibold">{result.organisation}</dd></div>
          <div><dt className="text-xs uppercase opacity-70">Issue date</dt><dd>{formatDate(result.issued_on)}</dd></div>
          <div><dt className="text-xs uppercase opacity-70">Valid upto</dt><dd>{result.valid_until ? formatDate(result.valid_until) : "—"}</dd></div>
          {result.revoked_on && <div><dt className="text-xs uppercase opacity-70">Revoked on</dt><dd>{formatDate(result.revoked_on)}</dd></div>}
        </dl>
      ) : result.result === "not_found" ? (
        <p className="mt-3 text-sm">The code may be mistyped, or the document may not be genuine. Contact the issuing medical centre.</p>
      ) : (
        <p className="mt-3 text-sm">Please try again in a few minutes.</p>
      )}
    </div>
  );
}
