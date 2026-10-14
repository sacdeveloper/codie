"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, Loader2, Save } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { CategoryDot } from "@/components/report-editor/field-input";
import type { FieldDefinition, ReportTemplate } from "@/lib/template/types";
import { LOCKED_FIELDS, MEDICAL_SECTIONS } from "@/lib/template/invariants";
import { previewTemplateAction, saveTemplateVersionAction } from "./actions";

type Tab = "layout" | "text" | "fields" | "json";

export function TemplateEditor({ initial }: { initial: ReportTemplate }) {
  const router = useRouter();
  const [t, setT] = useState<ReportTemplate>(() => structuredClone(initial));
  const [tab, setTab] = useState<Tab>("layout");
  const [json, setJson] = useState(() => JSON.stringify(initial.fieldConfiguration, null, 2));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; issues?: string[] } | null>(null);

  const up = (fn: (d: ReportTemplate) => void) =>
    setT((prev) => {
      const next = structuredClone(prev);
      fn(next);
      setJson(JSON.stringify(next.fieldConfiguration, null, 2));
      return next;
    });

  function current(): ReportTemplate | null {
    if (tab !== "json") return t;
    try {
      return { ...t, fieldConfiguration: JSON.parse(json) };
    } catch {
      setMsg({ ok: false, text: "The JSON is not valid." });
      return null;
    }
  }

  async function doPreview() {
    const c = current();
    if (!c) return;
    setBusy("preview");
    const res = await previewTemplateAction(c);
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: res.error, issues: res.details as string[] | undefined });
    setMsg(null);
    setPreview(res.data);
  }

  async function doSave(activate: boolean) {
    const c = current();
    if (!c) return;
    setBusy(activate ? "activate" : "save");
    const res = await saveTemplateVersionAction(c, activate);
    setBusy(null);
    if (!res.ok) return setMsg({ ok: false, text: res.error, issues: res.details as string[] | undefined });
    setMsg({ ok: true, text: `Saved as version ${res.data.version}${activate ? " and activated" : ""}. Previously issued reports keep the version they were issued with.` });
    router.refresh();
  }

  const lh = t.letterheadConfiguration;
  const lay = t.layoutConfiguration;
  const fc = t.fieldConfiguration;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {(["layout", "text", "fields", "json"] as Tab[]).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500"}`}>
            {{ layout: "Letterhead & layout", text: "Template text", fields: "Fields", json: "Advanced (JSON)" }[k]}
          </button>
        ))}
      </div>

      {msg && (
        <Alert variant={msg.ok ? "success" : "error"} title={msg.text}>
          {msg.issues && <ul className="list-disc pl-5 text-xs">{msg.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        </Alert>
      )}

      {tab === "layout" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label htmlFor="tname">Template name</Label>
            <Input id="tname" value={t.name} onChange={(e) => up((d) => void (d.name = e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lhmode">Letterhead mode</Label>
            <Select id="lhmode" value={lh.mode} onChange={(e) => up((d) => void (d.letterheadConfiguration.mode = e.target.value as typeof lh.mode))}>
              <option value="blank">Blank — reserved for pre-printed stationery (default)</option>
              <option value="text">Text — organisation details from settings</option>
              <option value="image">Image — approved letterhead image</option>
            </Select>
          </div>
          <Num label="Letterhead height (mm)" value={lh.heightMm} min={20} max={70} onChange={(v) => up((d) => void (d.letterheadConfiguration.heightMm = v))} />
          <Num label="Footer height (mm)" value={lay.footerHeightMm} min={25} max={60} onChange={(v) => up((d) => void (d.layoutConfiguration.footerHeightMm = v))} />
          <div className="space-y-1">
            <Label htmlFor="qrpos">QR code position</Label>
            <Select id="qrpos" value={lay.qrPosition} onChange={(e) => up((d) => void (d.layoutConfiguration.qrPosition = e.target.value as typeof lay.qrPosition))}>
              <option value="identity">Beside identity details (as on the reference)</option>
              <option value="footer">Footer centre</option>
            </Select>
          </div>
          <Num label="QR size (mm)" value={lay.qrSizeMm} min={18} max={35} onChange={(v) => up((d) => void (d.layoutConfiguration.qrSizeMm = v))} />
          <div className="space-y-1">
            <Label htmlFor="sigpos">Signature / seal positions</Label>
            <Select
              id="sigpos"
              value={lay.signaturePosition}
              onChange={(e) => up((d) => {
                d.layoutConfiguration.signaturePosition = e.target.value as "left" | "right";
                d.layoutConfiguration.sealPosition = e.target.value === "right" ? "left" : "right";
              })}
            >
              <option value="right">Seal left, signature right (reference)</option>
              <option value="left">Signature left, seal right</option>
            </Select>
          </div>
          <Num label="Side margins (mm)" value={lay.pageMarginMm} min={5} max={15} onChange={(v) => up((d) => void (d.layoutConfiguration.pageMarginMm = v))} />
          <Num label="Base font size (pt)" value={lay.baseFontPt} min={7.5} max={11} step={0.1} onChange={(v) => up((d) => void (d.layoutConfiguration.baseFontPt = v))} />
          <div className="space-y-1">
            <Label htmlFor="accent">Template colour (green on the reference)</Label>
            <Input id="accent" type="color" value={lay.accentColor} onChange={(e) => up((d) => void (d.layoutConfiguration.accentColor = e.target.value))} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lay.showPhotoBox} onChange={(e) => up((d) => void (d.layoutConfiguration.showPhotoBox = e.target.checked))} /> Show examinee photo box</label>
        </div>
      )}

      {tab === "text" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["reportTitle", "Report title"],
              ["subtitlePattern", "Subtitle pattern ({destination} is replaced)"],
              ["historyIntro", "Medical history introduction"],
              ["examineeSignatureLabel", "Examinee signature label"],
              ["examinationHeading", "Examination heading"],
              ["laboratoryHeading", "Laboratory heading"],
              ["remarksLabel", "Remarks label"],
              ["authorisedSignatoryLabel", "Authorised signatory caption"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={k}>{label}</Label>
              <Input id={k} value={fc[k]} onChange={(e) => up((d) => void ((d.fieldConfiguration as unknown as Record<string, string>)[k] = e.target.value))} />
            </div>
          ))}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="decl">Declaration text ({"{declaration_organisation_name}"} is replaced)</Label>
            <Textarea id="decl" rows={5} value={fc.declarationText} onChange={(e) => up((d) => void (d.fieldConfiguration.declarationText = e.target.value))} />
          </div>
        </div>
      )}

      {tab === "fields" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-500">
            Locked identity fields cannot be removed or made optional. Medical findings can never have default values. Use the Advanced tab for conditional rules and adding fields.
          </p>
          {fc.sections.map((s, si) => (
            <div key={s.key}>
              <h3 className="mb-2 text-sm font-semibold">{s.title}</h3>
              {s.groups.map((g, gi) => (
                <div key={g.key} className="mb-3 overflow-x-auto rounded-md border border-slate-200">
                  {g.title && <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-brand-700">{g.title}</p>}
                  <table className="w-full text-xs">
                    <thead className="text-left text-slate-500">
                      <tr><th className="p-2">Label</th><th className="p-2">Printed label</th><th className="p-2">Req.</th><th className="p-2">Options (comma separated)</th><th className="p-2">Unit</th><th className="p-2">Min</th><th className="p-2">Max</th><th className="p-2">Max len.</th><th className="p-2" /></tr>
                    </thead>
                    <tbody>
                      {g.fields.map((f, fi) => {
                        const locked = LOCKED_FIELDS[s.key]?.includes(f.key);
                        const set = (fn: (x: FieldDefinition) => void) => up((d) => fn(d.fieldConfiguration.sections[si].groups[gi].fields[fi]));
                        return (
                          <tr key={f.key} className="border-t border-slate-100">
                            <td className="p-1.5"><span className="flex items-center gap-1.5"><CategoryDot category={f.category} /><Input className="h-7 text-xs" value={f.label} onChange={(e) => set((x) => void (x.label = e.target.value))} /></span></td>
                            <td className="p-1.5"><Input className="h-7 text-xs" value={f.printLabel ?? ""} placeholder="(same)" onChange={(e) => set((x) => void (x.printLabel = e.target.value === "" ? undefined : e.target.value))} /></td>
                            <td className="p-1.5 text-center"><input type="checkbox" checked={f.required} disabled={locked} onChange={(e) => set((x) => void (x.required = e.target.checked))} aria-label="Required" /></td>
                            <td className="p-1.5">
                              {f.type === "select" || f.type === "result" ? (
                                <Input className="h-7 text-xs" value={(f.options ?? []).map((o) => o.value).join(", ")} onChange={(e) => set((x) => void (x.options = e.target.value.split(",").map((v) => v.trim()).filter(Boolean).map((v) => ({ value: v, label: v }))))} />
                              ) : <span className="text-slate-400">{f.type}</span>}
                            </td>
                            <td className="p-1.5"><Input className="h-7 w-20 text-xs" value={f.unit ?? ""} onChange={(e) => set((x) => void (x.unit = e.target.value || undefined))} /></td>
                            <td className="p-1.5"><Input className="h-7 w-16 text-xs" type="number" value={f.min ?? ""} disabled={f.type !== "number"} onChange={(e) => set((x) => void (x.min = e.target.value === "" ? undefined : Number(e.target.value)))} /></td>
                            <td className="p-1.5"><Input className="h-7 w-16 text-xs" type="number" value={f.max ?? ""} disabled={f.type !== "number"} onChange={(e) => set((x) => void (x.max = e.target.value === "" ? undefined : Number(e.target.value)))} /></td>
                            <td className="p-1.5"><Input className="h-7 w-16 text-xs" type="number" value={f.maxLength ?? ""} onChange={(e) => set((x) => void (x.maxLength = e.target.value === "" ? undefined : Number(e.target.value)))} /></td>
                            <td className="p-1.5 whitespace-nowrap">
                              <button type="button" className="p-1 text-slate-400 hover:text-slate-800" aria-label="Move up" disabled={fi === 0} onClick={() => up((d) => { const a = d.fieldConfiguration.sections[si].groups[gi].fields; [a[fi - 1], a[fi]] = [a[fi], a[fi - 1]]; })}><ArrowUp className="size-3.5" /></button>
                              <button type="button" className="p-1 text-slate-400 hover:text-slate-800" aria-label="Move down" disabled={fi === g.fields.length - 1} onClick={() => up((d) => { const a = d.fieldConfiguration.sections[si].groups[gi].fields; [a[fi + 1], a[fi]] = [a[fi], a[fi + 1]]; })}><ArrowDown className="size-3.5" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
              {MEDICAL_SECTIONS.includes(s.key) && <p className="text-xs text-slate-400">Defaults are disabled for medical findings.</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "json" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Full field configuration. Validated against the template schema and safety rules when previewing or saving.</p>
          <Textarea className="font-mono text-xs" rows={28} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={doPreview} disabled={!!busy}>{busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />} Preview with sample data</Button>
        <Button variant="secondary" onClick={() => doSave(false)} disabled={!!busy}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save as new version</Button>
        <Button onClick={() => doSave(true)} disabled={!!busy}>{busy === "activate" && <Loader2 className="animate-spin" />} Save and activate</Button>
      </div>

      {preview && (
        <div className="overflow-auto rounded-md border bg-slate-100 p-3">
          <iframe title="Template preview" srcDoc={preview} sandbox="" className="mx-auto block h-[1123px] w-[794px] bg-white shadow" />
        </div>
      )}
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
