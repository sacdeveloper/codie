import { requireSession } from "@/lib/auth/session";
import { extractToken, verifyToken } from "@/lib/verification";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VerificationResultCard } from "@/components/verification-result";

export const metadata = { title: "Report verification" };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const token = sp.code ? extractToken(sp.code) : null;
  const result = sp.code ? (token ? await verifyToken(token) : ({ result: "not_found" } as const)) : null;
  return (
    <>
      <PageHeader title="Report verification" description="Check a QR verification link exactly as the public sees it." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="py-5">
            <form className="space-y-3">
              <Label htmlFor="code">Verification URL or code</Label>
              <Input id="code" name="code" defaultValue={sp.code} placeholder="https://…/verify/…" />
              <Button type="submit">Verify</Button>
            </form>
            <div className="mt-6 space-y-2 text-sm text-slate-600">
              <p className="font-medium text-slate-800">How verification works</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Each issued report gets an unpredictable 256-bit token encoded in its QR code.</li>
                <li>Only a SHA-256 hash of the token is stored; the token reveals no record id or personal data.</li>
                <li>The public page shows status, reference number, issuing organisation and dates only.</li>
                <li>Revoked, superseded and expired reports are reported as such.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
        {result && <VerificationResultCard result={result} />}
      </div>
    </>
  );
}
