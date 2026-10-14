import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; inactive?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">MR</div>
          <h1 className="text-xl font-semibold">Medical Reporting</h1>
          <p className="text-sm text-slate-500">Authorised staff only</p>
        </div>
        <Card>
          <CardContent className="py-6">
            {sp.inactive && (
              <Alert variant="warning" className="mb-4" title="Account not active">
                Your account has not been attached to an organisation yet. Contact your administrator.
              </Alert>
            )}
            <LoginForm next={sp.next} />
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-slate-400">Access is monitored and recorded.</p>
      </div>
    </main>
  );
}
