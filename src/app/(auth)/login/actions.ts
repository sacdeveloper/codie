"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientKeyFromHeaders, getLimiter } from "@/lib/security/rate-limit";

const schema = z.object({ email: z.string().email().max(160), password: z.string().min(1).max(200), next: z.string().optional() });

export async function signIn(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return { error: "Enter your email address and password." };
  const ip = clientKeyFromHeaders(await headers());
  if (!getLimiter("login", 10).check(`${ip}:${parsed.data.email.toLowerCase()}`).allowed) {
    return { error: "Too many sign-in attempts. Wait a minute and try again." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  // Same message for unknown user and wrong password (no account enumeration).
  if (error) return { error: "Invalid email address or password." };
  const next = parsed.data.next && /^\/[A-Za-z0-9/_-]*$/.test(parsed.data.next) ? parsed.data.next : "/dashboard";
  redirect(next);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
