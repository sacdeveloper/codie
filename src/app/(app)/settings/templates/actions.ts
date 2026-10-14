"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { runAction, UserFacingError } from "@/lib/errors";
import { parseTemplate, TemplateValidationError } from "@/lib/template/invariants";
import { renderReportHtml } from "@/lib/pdf/render-html";
import { qrSvg } from "@/lib/qr/qr";
import { SAMPLE_META, SAMPLE_REPORT_DATA } from "@/lib/template/sample-data";
import type { ReportTemplate } from "@/lib/template/types";

function parse(input: unknown): ReportTemplate {
  const t = input as Partial<ReportTemplate>;
  try {
    return parseTemplate({
      name: String(t?.name ?? "").slice(0, 120) || "Medical Report",
      version: 1,
      fieldConfiguration: t?.fieldConfiguration,
      letterheadConfiguration: t?.letterheadConfiguration,
      layoutConfiguration: t?.layoutConfiguration,
    });
  } catch (e) {
    if (e instanceof TemplateValidationError) throw Object.assign(new UserFacingError("The template is invalid."), { details: e.issues.slice(0, 30) });
    throw e;
  }
}

/** Renders the template with clearly labelled SAMPLE data (never real patient data). */
export async function previewTemplateAction(input: unknown) {
  return runAction(async () => {
    const ctx = await authorize("templates.manage");
    const template = parse(input);
    const url = "https://example.invalid/verify/SAMPLE-SAMPLE-SAMPLE-SAMPLE-SAMPLE-SAMPLE-SAM";
    return renderReportHtml({
      template,
      data: SAMPLE_REPORT_DATA,
      meta: { ...SAMPLE_META, templateVersion: 0 },
      organisation: {
        name: ctx.organisation.name,
        declarationName: ctx.organisation.declaration_name || ctx.organisation.name,
        registrationNumber: ctx.organisation.registration_number,
        address: ctx.organisation.address,
        phone: ctx.organisation.phone,
        email: ctx.organisation.email,
        website: ctx.organisation.website,
        accreditationDetails: ctx.organisation.accreditation_details,
        footerLines: ctx.organisation.footer_lines ?? [],
      },
      qr: { svg: await qrSvg(url), url },
      watermark: "SAMPLE DATA",
    });
  });
}

export async function saveTemplateVersionAction(input: unknown, activate: boolean) {
  return runAction(async () => {
    const ctx = await authorize("templates.manage");
    const t = parse(input);
    const { data: last } = await ctx.supabase.from("report_templates").select("version").eq("organisation_id", ctx.organisation.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = ((last?.version as number | undefined) ?? 0) + 1;
    const { data, error } = await ctx.supabase
      .from("report_templates")
      .insert({
        organisation_id: ctx.organisation.id,
        name: t.name,
        version,
        field_configuration: t.fieldConfiguration,
        letterhead_configuration: t.letterheadConfiguration,
        layout_configuration: t.layoutConfiguration,
        is_active: false,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    await logAudit(ctx.supabase, "template.version_created", { type: "report_template", id: data.id as string }, { template_version: version });
    if (activate) await activate_(ctx, data.id as string, version);
    revalidatePath("/settings/templates");
    return { id: data.id as string, version };
  });
}

async function activate_(ctx: Awaited<ReturnType<typeof authorize>>, id: string, version: number) {
  // Only one active version per organisation (partial unique index): deactivate first.
  const off = await ctx.supabase.from("report_templates").update({ is_active: false }).eq("organisation_id", ctx.organisation.id).eq("is_active", true);
  if (off.error) throw off.error;
  const on = await ctx.supabase.from("report_templates").update({ is_active: true }).eq("id", id);
  if (on.error) throw on.error;
  await logAudit(ctx.supabase, "template.activated", { type: "report_template", id }, { template_version: version });
}

export async function activateTemplateAction(id: string) {
  return runAction(async () => {
    const ctx = await authorize("templates.manage");
    const { data } = await ctx.supabase.from("report_templates").select("id, version").eq("id", id).maybeSingle();
    if (!data) throw new UserFacingError("Template not found.", "not_found", 404);
    await activate_(ctx, id, data.version as number);
    revalidatePath("/settings/templates");
  });
}
