"use server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { runAction, UserFacingError, AuthorizationError } from "@/lib/errors";

export async function updateNameAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const s = await getSession();
    if (!s) throw new AuthorizationError("Please sign in again.");
    const name = z.string().trim().min(2).max(120).safeParse(formData.get("full_name"));
    if (!name.success) throw new UserFacingError("Enter your name (2–120 characters).");
    const { error } = await s.supabase.from("profiles").update({ full_name: name.data }).eq("id", s.userId);
    if (error) throw error;
    return { saved: "name" };
  });
}

export async function changePasswordAction(_prev: unknown, formData: FormData) {
  return runAction(async () => {
    const s = await getSession();
    if (!s) throw new AuthorizationError("Please sign in again.");
    const pw = String(formData.get("password") ?? "");
    if (pw.length < 12) throw new UserFacingError("Use at least 12 characters.");
    if (pw !== formData.get("confirm")) throw new UserFacingError("The passwords do not match.");
    const { error } = await s.supabase.auth.updateUser({ password: pw });
    if (error) throw new UserFacingError("The password could not be changed. Choose a stronger password.");
    return { saved: "password" };
  });
}
