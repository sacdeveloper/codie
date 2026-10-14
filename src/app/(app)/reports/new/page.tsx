import { randomUUID } from "node:crypto";
import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { createDraftAction } from "../actions";

export const metadata = { title: "Create report" };
export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  const s = await requireSession("reports.create");
  // A per-render request id makes draft creation idempotent if the form is resubmitted.
  const requestId = randomUUID();
  return (
    <>
      <PageHeader title="Create report" description={s.organisation?.name} />
      <Card className="max-w-2xl">
        <CardContent className="space-y-4 py-6">
          <p className="text-sm text-slate-600">
            A draft is created with a server-generated serial number. You will then upload the passport, review the extracted identity,
            and complete the examination and laboratory sections. Nothing is issued until a medical officer approves it.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Report information</li>
            <li>Passport upload and OCR</li>
            <li>Identity review</li>
            <li>Medical history, examination and laboratory results</li>
            <li>Review, save and issue (A4 PDF, QR code, cloud storage)</li>
          </ol>
          <form action={createDraftAction}>
            <input type="hidden" name="client_request_id" value={requestId} />
            <SubmitButton pendingText="Creating draft…">Start new report</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
