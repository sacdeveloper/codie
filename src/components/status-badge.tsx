import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, VERIFICATION_LABELS } from "@/lib/reports/data";
import type { ReportStatus, VerificationStatus } from "@/lib/supabase/types";

const STATUS_VARIANT = { draft: "default", pending_review: "warning", completed: "success", revoked: "danger", superseded: "purple" } as const;
const VERIFY_VARIANT = { not_issued: "default", valid: "success", revoked: "danger", superseded: "purple" } as const;

export function StatusBadge({ status }: { status: ReportStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <Badge variant={VERIFY_VARIANT[status]}>{VERIFICATION_LABELS[status]}</Badge>;
}
