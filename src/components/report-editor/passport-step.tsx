"use client";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, RotateCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import type { PassportExtraction, PassportFieldKey } from "@/lib/passport/types";
import { cn } from "@/lib/utils";
import { confirmPassportReviewAction } from "@/app/(app)/reports/actions";

export interface PassportDocSummary {
  id: string;
  ocr_status: string;
  original_filename: string | null;
  error_message: string | null;
  extraction: PassportExtraction | null;
  reviewed_at: string | null;
}

const FIELDS: Array<{ key: PassportFieldKey; label: string; type?: "date" | "sex"; info?: string }> = [
  { key: "surname", label: "Surname / family name" },
  { key: "givenNames", label: "Given names" },
  { key: "fullName", label: "Full name (as it should appear on the report)" },
  { key: "passportNumber", label: "Passport number (exactly as printed)" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "sex", label: "Sex", type: "sex" },
  { key: "nationality", label: "Nationality" },
  { key: "placeOfIssue", label: "Place of issue" },
  { key: "issuingAuthority", label: "Issuing authority", info: "For reference only — not copied to the report." },
  { key: "dateOfIssue", label: "Date of issue", type: "date" },
  { key: "dateOfExpiry", label: "Date of expiry", type: "date" },
];

type Phase = "idle" | "uploading" | "processing" | "done";

export function PassportStep(props: {
  reportId: string;
  initialDoc: PassportDocSummary | null;
  disabled: boolean;
  getUpdatedAt: () => string;
  onConfirmed: (examinee: Record<string, unknown>, updatedAt: string) => void;
  onManual: () => void;
}) {
  const [doc, setDoc] = useState<PassportDocSummary | null>(props.initialDoc);
  const [phase, setPhase] = useState<Phase>(props.initialDoc ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<PassportFieldKey, string>>(() => initialValues(props.initialDoc?.extraction ?? null));
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(props.initialDoc?.reviewed_at ? "Identity details were reviewed and applied to the report." : null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyOcr(d: PassportDocSummary) {
    setDoc(d);
    setValues(initialValues(d.extraction));
    setAttested(false);
    setSaved(null);
  }

  async function upload(file: File) {
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("uploading");
    const body = new FormData();
    body.set("file", file);
    body.set("kind", "passport");
    try {
      const t = setTimeout(() => setPhase((p) => (p === "uploading" ? "processing" : p)), 800);
      const res = await fetch(`/api/reports/${props.reportId}/documents`, { method: "POST", body, signal: ac.signal });
      clearTimeout(t);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      applyOcr({
        id: json.document.id,
        ocr_status: json.ocr.status,
        original_filename: json.document.original_filename,
        error_message: json.ocr.error ?? null,
        extraction: json.ocr.extraction,
        reviewed_at: null,
      });
      setPhase("done");
    } catch (e) {
      setPhase(doc ? "done" : "idle");
      setError(ac.signal.aborted ? "Upload cancelled." : (e as Error).message);
    } finally {
      abortRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function retry() {
    if (!doc) return;
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("processing");
    try {
      const res = await fetch(`/api/passport-documents/${doc.id}/ocr`, { method: "POST", signal: ac.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "OCR failed.");
      applyOcr({ ...doc, ocr_status: json.ocr.status, error_message: json.ocr.error ?? null, extraction: json.ocr.extraction });
    } catch (e) {
      setError(ac.signal.aborted ? "OCR cancelled." : (e as Error).message);
    } finally {
      setPhase("done");
      abortRef.current = null;
    }
  }

  async function confirm() {
    if (!doc) return;
    setSaving(true);
    setFieldErrors([]);
    const payload = Object.fromEntries(FIELDS.map((f) => [f.key, values[f.key]?.trim() ? values[f.key].trim() : null]));
    const res = await confirmPassportReviewAction(doc.id, payload, props.getUpdatedAt());
    setSaving(false);
    if (!res.ok) return setError(res.error);
    if (!res.data.ok) return setFieldErrors(res.data.errors.map((e) => `${e.label}: ${e.message}`));
    props.onConfirmed(res.data.examinee, res.data.updatedAt);
    setSaved("Identity details confirmed and applied to the report. Review the remaining examinee fields in the next step.");
  }

  const busy = phase === "uploading" || phase === "processing";
  const ex = doc?.extraction ?? null;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <FileUp className="mx-auto mb-2 size-8 text-slate-400" />
        <p className="text-sm font-medium">Upload the passport bio-data page</p>
        <p className="mb-3 text-xs text-slate-500">JPEG, PNG, WebP or PDF. The original is stored privately and never shown publicly.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          id="passport-file"
          disabled={props.disabled || busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <div className="flex justify-center gap-2">
          <Button asChild variant="secondary" disabled={props.disabled || busy}>
            <label htmlFor="passport-file" className="cursor-pointer">{doc ? "Upload a different file" : "Choose file"}</label>
          </Button>
          <Button variant="ghost" onClick={props.onManual} disabled={props.disabled}>Enter details manually</Button>
        </div>
      </div>

      {busy && (
        <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="status">
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {phase === "uploading" ? "Uploading securely…" : "Extracting passport details…"}
          </span>
          <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>Cancel</Button>
        </div>
      )}
      {error && <Alert variant="error">{error}</Alert>}

      {doc && !busy && (doc.ocr_status === "failed" || doc.ocr_status === "cancelled") && (
        <Alert variant="warning" title={doc.ocr_status === "failed" ? "Automatic extraction failed" : "Extraction cancelled"}>
          <p>{doc.error_message ?? "The document could not be read."}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={retry} disabled={props.disabled}><RotateCw /> Retry OCR</Button>
            <Button size="sm" variant="ghost" onClick={props.onManual}>Enter details manually</Button>
          </div>
        </Alert>
      )}

      {ex && !busy && (
        <div className="space-y-4">
          {ex.isMock && (
            <Alert variant="warning" title="Development mock OCR">
              These values come from the mock provider and were NOT read from your document. Replace them with the real passport details.
            </Alert>
          )}
          {ex.warnings.map((w) => <Alert key={w} variant="info">{w}</Alert>)}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Review extracted values</h3>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> needs review</span>
              <Button size="sm" variant="ghost" onClick={retry} disabled={props.disabled}><RotateCw /> Re-run OCR</Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => {
              const meta = ex.fields[f.key];
              const flagged = meta?.needsReview;
              return (
                <div key={f.key} className={cn("rounded-md border p-3", flagged ? "border-amber-300 bg-amber-50/50" : "border-slate-200")}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor={`pp-${f.key}`} className="text-xs font-medium text-slate-700">{f.label}</label>
                    <span className="flex items-center gap-1">
                      {meta?.source && meta.source !== "none" && <Badge>{meta.source.toUpperCase()}</Badge>}
                      {meta?.confidence != null && <Badge variant={meta.confidence >= 0.85 ? "success" : "warning"}>{Math.round(meta.confidence * 100)}%</Badge>}
                      {flagged ? <AlertTriangle className="size-4 text-amber-600" aria-label="Needs review" /> : <CheckCircle2 className="size-4 text-green-600" aria-label="Looks consistent" />}
                    </span>
                  </div>
                  {f.type === "sex" ? (
                    <Select id={`pp-${f.key}`} value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} disabled={props.disabled}>
                      <option value="">— Select —</option>
                      <option value="MALE">MALE</option>
                      <option value="FEMALE">FEMALE</option>
                    </Select>
                  ) : (
                    <Input
                      id={`pp-${f.key}`}
                      type={f.type === "date" ? "date" : "text"}
                      value={values[f.key]}
                      maxLength={80}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      disabled={props.disabled}
                    />
                  )}
                  {(meta?.reason || f.info) && <p className="mt-1 text-xs text-slate-500">{f.info ?? meta?.reason}</p>}
                </div>
              );
            })}
          </div>
          {fieldErrors.length > 0 && (
            <Alert variant="error" title="Please correct these values">
              <ul className="list-disc pl-5">{fieldErrors.map((e) => <li key={e}>{e}</li>)}</ul>
            </Alert>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={attested} onChange={(e) => setAttested(e.target.checked)} disabled={props.disabled} />
            <span>I have compared these values with the original passport and corrected any errors.</span>
          </label>
          <Button onClick={confirm} disabled={!attested || saving || props.disabled}>
            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm and apply to report
          </Button>
          {saved && <Alert variant="success">{saved}</Alert>}
        </div>
      )}
      {doc && !ex && !busy && doc.ocr_status === "succeeded" && <Alert variant="info">Extraction data unavailable. <XCircle className="inline size-4" /></Alert>}
    </div>
  );
}

function initialValues(ex: PassportExtraction | null): Record<PassportFieldKey, string> {
  return Object.fromEntries(FIELDS.map((f) => [f.key, ex?.fields[f.key]?.value ?? ""])) as Record<PassportFieldKey, string>;
}
