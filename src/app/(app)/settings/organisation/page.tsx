import { requireSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrganisationRow } from "@/lib/supabase/types";
import { AssetUpload, OrganisationForm } from "./forms";

export const metadata = { title: "Organisation settings" };

export default async function OrganisationSettingsPage() {
  const s = await requireSession("organisation.manage");
  const org = s.organisation as OrganisationRow;
  return (
    <>
      <PageHeader title="Organisation settings" description="Predefined values used on every report (green content on the reference form)." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardContent className="py-5">
            <OrganisationForm org={org} settings={s.settings} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Letterhead assets</CardTitle>
              <CardDescription>
                By default the top of the page is left blank for pre-printed letterhead stationery. Choose the letterhead mode (blank, text or image) in Report Templates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AssetUpload kind="logo" label="Logo" current={org.logo_path} help="Used in the text letterhead mode." />
              <AssetUpload kind="letterhead" label="Approved letterhead image" current={org.letterhead_path} help="Full-width image used in the image letterhead mode." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Approved signature and seal</CardTitle>
              <CardDescription>
                Optional. Only applied when enabled in settings and explicitly chosen when issuing a report. By default reports are signed and stamped by hand.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <AssetUpload kind="signature" label="Medical officer signature" current={org.signature_image_path} help="Transparent PNG recommended." disabled={!s.settings.signature_images_enabled} />
              <AssetUpload kind="seal" label="Organisation seal" current={org.seal_image_path} help="Transparent PNG recommended." disabled={!s.settings.signature_images_enabled} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
