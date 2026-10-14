"use client";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { OrganisationRow } from "@/lib/supabase/types";
import type { OrganisationSettings } from "@/lib/organisation/settings";
import { removeAssetAction, updateOrganisationAction, uploadAssetAction } from "./actions";

type R = Awaited<ReturnType<typeof updateOrganisationAction>> | undefined;

function Field({ label, name, defaultValue, type = "text", help, ...rest }: { label: string; name: string; defaultValue?: string | number | null; type?: string; help?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} {...rest} />
      {help && <p className="text-xs text-slate-500">{help}</p>}
    </div>
  );
}

export function OrganisationForm({ org, settings }: { org: OrganisationRow; settings: OrganisationSettings }) {
  const [state, action, pending] = useActionState<R, FormData>(updateOrganisationAction, undefined);
  return (
    <form action={action} className="space-y-6">
      {state && (state.ok ? <Alert variant="success">Settings saved.</Alert> : <Alert variant="error">{state.error}</Alert>)}
      <section className="grid gap-4 sm:grid-cols-2">
        <h3 className="text-sm font-semibold sm:col-span-2">Organisation and letterhead details</h3>
        <Field label="Medical centre name" name="name" defaultValue={org.name} required />
        <Field label="Name used in the examinee declaration" name="declaration_name" defaultValue={org.declaration_name} help='Substituted into "I hereby permit the … and the undersigned physician…" and the signatory caption.' />
        <Field label="Registration number" name="registration_number" defaultValue={org.registration_number} />
        <Field label="Accreditation details" name="accreditation_details" defaultValue={org.accreditation_details} placeholder="An ISO 9001 : 2015 Accredited Medical Centre" />
        <Field label="Phone" name="phone" defaultValue={org.phone} />
        <Field label="Email" name="email" type="email" defaultValue={org.email} />
        <Field label="Website" name="website" defaultValue={org.website} />
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Textarea id="address" name="address" rows={3} defaultValue={org.address ?? ""} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="footer_lines">Footer lines (printed in the footer centre, max. 4)</Label>
          <Textarea id="footer_lines" name="footer_lines" rows={3} defaultValue={(org.footer_lines ?? []).join("\n")} />
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <h3 className="text-sm font-semibold sm:col-span-3">Serial numbers and validity</h3>
        <Field label="Serial prefix" name="serial_prefix" defaultValue={settings.serial_prefix} maxLength={6} help='Reference format: "R-7".' />
        <div className="space-y-1">
          <Label htmlFor="serial_reset">Sequence reset</Label>
          <Select id="serial_reset" name="serial_reset" defaultValue={settings.serial_reset}>
            <option value="never">Never (R-1, R-2 …)</option>
            <option value="yearly">Yearly (R-2026-1 …)</option>
          </Select>
        </div>
        <Field label="Zero padding" name="serial_padding" type="number" min={0} max={8} defaultValue={settings.serial_padding} />
        <Field label="Validity amount" name="validity_amount" type="number" min={1} max={36} defaultValue={settings.validity_rule.amount} />
        <div className="space-y-1">
          <Label htmlFor="validity_unit">Validity unit</Label>
          <Select id="validity_unit" name="validity_unit" defaultValue={settings.validity_rule.unit}>
            <option value="days">Days</option>
            <option value="months">Months</option>
            <option value="years">Years</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="validity_minus_day" defaultChecked={settings.validity_rule.subtractOneDay} /> Subtract one day (reference: 28/07/2026 → 27/07/2027)</label>
        <Field label="Time zone (IANA)" name="timezone" defaultValue={settings.timezone} help="Used for exam dates, e.g. Asia/Kolkata." />
        <Field label="Passport retention (days)" name="passport_retention_days" type="number" min={30} defaultValue={settings.passport_retention_days ?? ""} help="Leave empty to keep until manually purged." />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Workflow and verification</h3>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="require_independent_review" defaultChecked={settings.require_independent_review} /> Require independent review (the issuer must differ from the submitter)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verification_expires_after_validity" defaultChecked={settings.verification_expires_after_validity} /> Show “expired” on the QR page after the validity date</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="signature_images_enabled" defaultChecked={settings.signature_images_enabled} /> Allow approved signature and seal images (disabled by default; areas stay blank for manual signing)</label>
      </section>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
    </form>
  );
}

export function AssetUpload({ kind, label, current, help, disabled }: { kind: string; label: string; current: string | null; help: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<R, FormData>(uploadAssetAction, undefined);
  return (
    <form action={action} className="space-y-2 rounded-md border border-slate-200 p-4">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <span className="text-xs text-slate-500">{current ? "Configured" : "Not set"}</span>
      </div>
      <p className="text-xs text-slate-500">{help}</p>
      {state && !state.ok && <Alert variant="error">{state.error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" name="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} className="max-w-xs" />
        <Button type="submit" size="sm" variant="secondary" disabled={pending || disabled}>{pending ? "Uploading…" : "Upload"}</Button>
        {current && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => removeAssetAction(kind).then(() => location.reload())}>Remove</Button>
        )}
      </div>
    </form>
  );
}
