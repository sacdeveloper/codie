"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Loader2, RefreshCw, Save, Send, ShieldCheck, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { buildReportFormSchema, type ReportFormValues } from "@/lib/template/form-schema";
import type { ReportTemplate } from "@/lib/template/types";
import type { ReportStatus } from "@/lib/supabase/types";
import type { CompletionCheck } from "@/lib/reports/service";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SectionForm } from "./section-form";
import { CategoryDot } from "./field-input";
import { PassportStep, type PassportDocSummary } from "./passport-step";
import {
  checkCompletionAction,
  confirmManualIdentityAction,
  issueReportAction,
  returnToDraftAction,
  saveReportAction,
  submitForReviewAction,
} from "@/app/(app)/reports/actions";

export interface EditorProps {
  report: {
    id: string;
    serialNumber: string;
    revisionNumber: number;
    status: ReportStatus;
    reportDate: string;
    validUntil: string | null;
    updatedAt: string;
    templateVersion: number;
    identityConfirmed: boolean;
    identitySource: string | null;
    hasPhoto: boolean;
  };
  template: ReportTemplate;
  initialValues: ReportFormValues;
  passportDoc: PassportDocSummary | null;
  permissions: { canSubmit: boolean; canIssue: boolean; signatureImagesEnabled: boolean };
  validityRule: string;
}

const STEPS = [
  { key: "info", label: "Report information" },
  { key: "passport", label: "Passport upload" },
  { key: "identity", label: "Identity review" },
  { key: "medical", label: "Medical examination" },
  { key: "review", label: "Review" },
  { key: "issue", label: "Save & generate" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

const SECTION_STEP: Record<string, StepKey> = { report: "info", examinee: "identity", history: "medical", examination: "medical", laboratory: "medical", remarks: "medical", meta: "info" };

export function ReportEditor({ report, template, initialValues, passportDoc, permissions, validityRule }: EditorProps) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>(passportDoc || report.identityConfirmed ? "identity" : "info");
  const [updatedAt, setUpdatedAt] = useState(report.updatedAt);
  const updatedAtRef = useRef(report.updatedAt);
  const [reportDate, setReportDate] = useState(report.reportDate);
  const [validUntil, setValidUntil] = useState(report.validUntil);
  const [identityConfirmed, setIdentityConfirmed] = useState(report.identityConfirmed);
  const [status, setStatus] = useState(report.status);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: "success" | "error" | "warning" | "info"; text: string } | null>(null);
  const [check, setCheck] = useState<CompletionCheck | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const [applySignatures, setApplySignatures] = useState(false);
  const [photo, setPhoto] = useState(report.hasPhoto);

  const methods = useForm<ReportFormValues>({
    defaultValues: initialValues,
    resolver: zodResolver(buildReportFormSchema(template, "draft", reportDate)),
    mode: "onBlur",
  });
  const { isDirty } = methods.formState;
  const locked = status === "pending_review" && !permissions.canIssue;

  const bumpUpdatedAt = (v: string) => {
    updatedAtRef.current = v;
    setUpdatedAt(v);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (methods.formState.isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [methods.formState]);

  const save = useCallback(
    async (quiet = false): Promise<boolean> => {
      const valid = await methods.trigger();
      if (!valid) {
        setMessage({ variant: "error", text: "Some values are invalid. Correct the highlighted fields." });
        return false;
      }
      setBusy("save");
      const values = methods.getValues();
      const sections = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, Object.fromEntries(Object.entries(v ?? {}).map(([fk, fv]) => [fk, fv === undefined || fv === "" ? null : fv]))]),
      );
      const res = await saveReportAction(report.id, { sections, reportDate, expectedUpdatedAt: updatedAtRef.current });
      setBusy(null);
      if (!res.ok) {
        setMessage({ variant: "error", text: res.error });
        return false;
      }
      if (res.data.errors.length) {
        for (const e of res.data.errors) {
          const [s, k] = e.path.split(".");
          if (s !== "meta") methods.setError(`${s}.${k}` as never, { message: e.message });
        }
        setMessage({ variant: "error", text: `Not saved: ${res.data.errors.map((e) => `${e.label} – ${e.message}`).join("; ")}` });
        return false;
      }
      bumpUpdatedAt(res.data.updatedAt);
      setValidUntil(res.data.validUntil);
      methods.reset(methods.getValues());
      if (!quiet) setMessage({ variant: "success", text: "Draft saved." });
      return true;
    },
    [methods, report.id, reportDate],
  );

  async function goto(next: StepKey) {
    if (isDirty && !locked && status !== "completed") {
      const ok = await save(true);
      if (!ok) return;
    }
    setMessage(null);
    setStep(next);
    if (next === "review" || next === "issue") {
      setPreviewKey((k) => k + 1);
      runCheck();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function runCheck() {
    const res = await checkCompletionAction(report.id);
    if (res.ok) setCheck(res.data);
  }

  async function confirmManual() {
    if (!(await save(true))) return;
    setBusy("manual");
    const res = await confirmManualIdentityAction(report.id);
    setBusy(null);
    if (!res.ok) return setMessage({ variant: "error", text: res.error });
    bumpUpdatedAt(res.data.updatedAt);
    setIdentityConfirmed(true);
    setMessage({ variant: "success", text: "Identity details confirmed as manually entered." });
  }

  async function submit() {
    if (isDirty && !(await save(true))) return;
    setBusy("submit");
    const res = await submitForReviewAction(report.id);
    setBusy(null);
    if (!res.ok) return setMessage({ variant: "error", text: res.error });
    setCheck(res.data);
    if (!res.data.ok) return setMessage({ variant: "warning", text: "The report is not complete yet. Resolve the items below." });
    setStatus("pending_review");
    setMessage({ variant: "success", text: "Submitted for review. A medical officer can now issue the report." });
    router.refresh();
  }

  async function returnDraft() {
    setBusy("return");
    const res = await returnToDraftAction(report.id);
    setBusy(null);
    if (!res.ok) return setMessage({ variant: "error", text: res.error });
    setStatus("draft");
    setMessage({ variant: "info", text: "Returned to draft for changes." });
  }

  async function issue(layoutMode: "single" | "continuation" = "single") {
    if (isDirty && !(await save(true))) return;
    setBusy("issue");
    setMessage({ variant: "info", text: "Validating, generating the A4 PDF and QR code, and saving to cloud storage…" });
    const res = await issueReportAction(report.id, { layoutMode, applySignatureImages: applySignatures });
    setBusy(null);
    if (!res.ok) {
      if (res.code === "overflow") setOverflow(true);
      if (res.details && typeof res.details === "object" && "checklist" in (res.details as object)) setCheck(res.details as CompletionCheck);
      return setMessage({ variant: "error", text: res.error });
    }
    router.push(`/reports/${report.id}?issued=1`);
  }

  async function uploadPhoto(file: File) {
    setBusy("photo");
    const body = new FormData();
    body.set("file", file);
    body.set("kind", "photo");
    const res = await fetch(`/api/reports/${report.id}/documents`, { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setMessage({ variant: "error", text: json.error ?? "Photo upload failed." });
    setPhoto(true);
    router.refresh();
    setMessage({ variant: "success", text: "Photograph uploaded." });
  }

  const idx = STEPS.findIndex((s) => s.key === step);

  return (
    <FormProvider {...methods}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm font-semibold">{report.serialNumber}</span>
        {report.revisionNumber > 1 && <span className="text-xs text-slate-500">Revision {report.revisionNumber}</span>}
        <StatusBadge status={status} />
        <span className="text-xs text-slate-500">Template v{report.templateVersion}</span>
        <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><CategoryDot category="predefined" /> predefined</span>
          <span className="inline-flex items-center gap-1"><CategoryDot category="manual" /> manual entry</span>
          {isDirty ? <span className="text-amber-700">Unsaved changes</span> : <span>All changes saved</span>}
        </span>
      </div>

      <nav aria-label="Report steps" className="mb-6 overflow-x-auto">
        <ol className="flex min-w-max gap-1">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => goto(s.key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  s.key === step ? "bg-brand-600 text-white" : i < idx ? "bg-brand-50 text-brand-700" : "bg-white text-slate-600 hover:bg-slate-100",
                )}
                aria-current={s.key === step ? "step" : undefined}
              >
                <span className="flex size-5 items-center justify-center rounded-full border border-current text-xs">{i + 1}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {message && <Alert variant={message.variant} className="mb-4">{message.text}</Alert>}
      {locked && <Alert variant="info" className="mb-4">This report is awaiting review by a medical officer and cannot be edited.</Alert>}

      <Card>
        {step === "info" && (
          <>
            <CardHeader>
              <CardTitle>Step 1 — Report information</CardTitle>
              <CardDescription>Serial number and validity are generated by the server. Choose the destination and confirm the exam date.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <ReadOnly label="Report title" value={template.fieldConfiguration.reportTitle} />
              <ReadOnly label="Serial number" value={report.serialNumber} />
              <div className="space-y-1">
                <Label htmlFor="report-date" className="flex items-center gap-1.5"><CategoryDot category="manual" /> Exam date *</Label>
                <Input id="report-date" type="date" value={reportDate} onChange={(e) => { setReportDate(e.target.value); methods.setValue("report.destination", methods.getValues("report.destination"), { shouldDirty: true }); }} disabled={locked} />
              </div>
              <ReadOnly label="Valid upto (calculated)" value={formatDate(validUntil)} help={`Rule: ${validityRule}. Recalculated when saved.`} />
              <ReadOnly label="Status" value={status.replace("_", " ")} />
              <ReadOnly label="Template version" value={`v${report.templateVersion}`} />
              <div className="sm:col-span-2">
                <SectionForm template={template} section="report" disabled={locked} />
              </div>
            </CardContent>
          </>
        )}

        {step === "passport" && (
          <>
            <CardHeader>
              <CardTitle>Step 2 — Passport upload</CardTitle>
              <CardDescription>The passport is processed server-side. Extracted values must be reviewed before they are saved.</CardDescription>
            </CardHeader>
            <CardContent>
              <PassportStep
                reportId={report.id}
                initialDoc={passportDoc}
                disabled={locked}
                getUpdatedAt={() => updatedAtRef.current}
                onConfirmed={(examinee, ua) => {
                  for (const [k, v] of Object.entries(examinee)) methods.setValue(`examinee.${k}` as never, (v ?? "") as never, { shouldDirty: false });
                  methods.reset(methods.getValues());
                  bumpUpdatedAt(ua);
                  setIdentityConfirmed(true);
                }}
                onManual={() => goto("identity")}
              />
            </CardContent>
          </>
        )}

        {step === "identity" && (
          <>
            <CardHeader>
              <CardTitle>Step 3 — Identity review</CardTitle>
              <CardDescription>Check every identity value against the passport and complete the remaining examinee details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {identityConfirmed ? (
                <Alert variant="success">Identity confirmed ({report.identitySource === "manual" ? "manual entry" : "reviewed passport extraction"}). Further edits are saved with the draft.</Alert>
              ) : (
                <Alert variant="warning" title="Identity not yet confirmed">
                  Confirm the reviewed passport extraction in step 2, or enter the details below and confirm them as manually entered.
                </Alert>
              )}
              <SectionForm template={template} section="examinee" disabled={locked} />
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                {!identityConfirmed && (
                  <Button variant="secondary" onClick={confirmManual} disabled={!!busy || locked}>
                    {busy === "manual" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Confirm identity entered manually
                  </Button>
                )}
                {template.layoutConfiguration.showPhotoBox && (
                  <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600", locked && "pointer-events-none opacity-50")}>
                    <Upload className="size-4" /> {photo ? "Replace examinee photograph" : "Upload examinee photograph (optional)"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
                  </label>
                )}
                {!photo && template.layoutConfiguration.showPhotoBox && <span className="text-xs text-slate-500">Without a photo the box is left blank for a printed photograph.</span>}
              </div>
            </CardContent>
          </>
        )}

        {step === "medical" && (
          <>
            <CardHeader>
              <CardTitle>Step 4 — Medical history, examination and laboratory results</CardTitle>
              <CardDescription>All results are entered manually. Suggestions are offered, but nothing is pre-filled.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <section>
                <h3 className="mb-1 text-sm font-semibold">Medical history</h3>
                <p className="mb-3 text-sm text-brand-700">{template.fieldConfiguration.historyIntro}</p>
                <SectionForm template={template} section="history" disabled={locked} />
                <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold">Declaration (signed by the examinee on the printed report): </span>
                  {template.fieldConfiguration.declarationText.replace("{declaration_organisation_name}", "[organisation]")}
                </p>
              </section>
              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <h3 className="mb-3 text-sm font-semibold">{template.fieldConfiguration.examinationHeading}</h3>
                  <SectionForm template={template} section="examination" disabled={locked} />
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold">{template.fieldConfiguration.laboratoryHeading}</h3>
                  <SectionForm template={template} section="laboratory" disabled={locked} />
                </section>
              </div>
              <section>
                <h3 className="mb-3 text-sm font-semibold">{template.fieldConfiguration.remarksLabel}</h3>
                <SectionForm template={template} section="remarks" disabled={locked} />
              </section>
            </CardContent>
          </>
        )}

        {(step === "review" || step === "issue") && (
          <>
            <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>{step === "review" ? "Step 5 — Review" : "Step 6 — Save and generate"}</CardTitle>
                <CardDescription>
                  {step === "review" ? "Check the preview, missing fields and review steps." : "Save the draft, submit it for review, or issue the final A4 PDF with QR verification."}
                </CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={() => { setPreviewKey((k) => k + 1); runCheck(); }}>
                <RefreshCw /> Refresh
              </Button>
            </CardHeader>
            <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="overflow-auto rounded-md border bg-slate-100 p-3">
                <iframe
                  key={previewKey}
                  title="Report preview"
                  src={`/api/reports/${report.id}/preview?v=${previewKey}-${updatedAt}`}
                  sandbox=""
                  className="mx-auto block h-[1123px] w-[794px] origin-top bg-white shadow"
                />
              </div>
              <div className="space-y-4">
                <ChecklistPanel check={check} onJump={(path) => goto(SECTION_STEP[path.split(".")[0]] ?? "medical")} />
                {step === "issue" && (
                  <div className="space-y-3 rounded-md border border-slate-200 p-4">
                    <Button variant="secondary" className="w-full" onClick={() => save()} disabled={!!busy || locked}>
                      {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save draft
                    </Button>
                    {permissions.canSubmit && status === "draft" && (
                      <Button variant="secondary" className="w-full" onClick={submit} disabled={!!busy}>
                        {busy === "submit" ? <Loader2 className="animate-spin" /> : <Send />} Submit for review
                      </Button>
                    )}
                    {permissions.canIssue && status === "pending_review" && (
                      <Button variant="ghost" className="w-full" onClick={returnDraft} disabled={!!busy}>
                        <Undo2 /> Return to draft
                      </Button>
                    )}
                    {permissions.canIssue && (
                      <>
                        {permissions.signatureImagesEnabled && (
                          <label className="flex items-start gap-2 text-sm">
                            <input type="checkbox" className="mt-0.5" checked={applySignatures} onChange={(e) => setApplySignatures(e.target.checked)} />
                            <span>Apply the organisation&apos;s approved signature and seal images (otherwise the areas stay blank for manual signing).</span>
                          </label>
                        )}
                        <Button className="w-full" onClick={() => issue("single")} disabled={!!busy}>
                          {busy === "issue" ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Approve and issue report
                        </Button>
                        {overflow && (
                          <Alert variant="warning" title="Content does not fit on one page">
                            Shorten the longest values (usually Remarks), or issue with a controlled continuation page.
                            <Button size="sm" variant="secondary" className="mt-2" onClick={() => issue("continuation")} disabled={!!busy}>
                              Issue with continuation page
                            </Button>
                          </Alert>
                        )}
                        <p className="text-xs text-slate-500">
                          Issuing generates a unique verification QR code, renders the A4 PDF on the server and stores it privately. Issued reports cannot be edited; corrections create a new revision.
                        </p>
                      </>
                    )}
                    {!permissions.canIssue && <p className="text-xs text-slate-500">A medical officer or organisation administrator issues the final report.</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <Button variant="ghost" onClick={() => goto(STEPS[Math.max(0, idx - 1)].key)} disabled={idx === 0 || !!busy}>
            <ChevronLeft /> Back
          </Button>
          <div className="flex gap-2">
            {step !== "issue" && step !== "review" && (
              <Button variant="secondary" onClick={() => save()} disabled={!!busy || locked || !isDirty}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save draft
              </Button>
            )}
            {idx < STEPS.length - 1 && (
              <Button onClick={() => goto(STEPS[idx + 1].key)} disabled={!!busy}>
                Next <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </FormProvider>
  );
}

function ReadOnly({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700"><CategoryDot category="predefined" /> {label}</p>
      <p className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm capitalize">{value || "—"}</p>
      {help && <p className="text-xs text-slate-500">{help}</p>}
    </div>
  );
}

function ChecklistPanel({ check, onJump }: { check: CompletionCheck | null; onJump: (path: string) => void }) {
  if (!check) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Checking report…</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {check.checklist.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-sm">
            {c.done ? <CheckCircle2 className="mt-0.5 size-4 text-green-600" /> : <Circle className={cn("mt-0.5 size-4", c.required ? "text-red-500" : "text-slate-400")} />}
            <span>
              {c.label}
              {!c.required && <span className="text-slate-400"> (optional)</span>}
            </span>
          </li>
        ))}
      </ul>
      {check.errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="mb-1 text-sm font-semibold text-red-900">{check.errors.length} item(s) to complete</p>
          <ul className="max-h-64 space-y-0.5 overflow-auto text-xs text-red-800">
            {check.errors.map((e) => (
              <li key={e.path}>
                <button type="button" className="text-left hover:underline" onClick={() => onJump(e.path)}>
                  {e.label}: {e.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {check.warnings.map((w) => <Alert key={w.path} variant="warning">{w.label}: {w.message}</Alert>)}
    </div>
  );
}
