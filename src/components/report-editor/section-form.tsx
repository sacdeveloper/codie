"use client";
import type { ReportTemplate, SectionKey } from "@/lib/template/types";
import { FieldInput } from "./field-input";

/** Renders a template section, grouped as on the printed report (e.g. EYE, EAR, URINE…). */
export function SectionForm({ template, section, disabled, exclude = [] }: { template: ReportTemplate; section: SectionKey; disabled?: boolean; exclude?: string[] }) {
  const s = template.fieldConfiguration.sections.find((x) => x.key === section);
  if (!s) return null;
  const tabular = section === "examination" || section === "laboratory";
  return (
    <div className="space-y-5">
      {s.groups.map((g) => {
        const fields = g.fields.filter((f) => !exclude.includes(f.key));
        if (!fields.length) return null;
        return (
          <fieldset key={g.key} className={tabular ? "rounded-md border border-slate-200 p-4" : undefined}>
            {g.title && <legend className="px-1 text-xs font-semibold tracking-wide text-brand-700 uppercase">{g.title}</legend>}
            <div className={tabular ? "space-y-3" : "grid gap-4 sm:grid-cols-2"}>
              {fields.map((f) => (
                <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
                  {f.headingBefore && <p className="mb-2 text-xs font-semibold text-brand-700 uppercase">{f.headingBefore}</p>}
                  <FieldInput section={section} field={f} disabled={disabled} compact={tabular} />
                </div>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
