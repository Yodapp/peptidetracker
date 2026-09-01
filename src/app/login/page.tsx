import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { ShieldCheck } from "lucide-react";

async function sendMagicLink(formData: FormData) {
  "use server";
  if (!hasSupabaseEnv()) redirect("/");
  const email = String(formData.get("email") ?? "").trim().toLocaleLowerCase();
  if (!email) redirect("/login?error=email");
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || requestHeaders.get("origin") || "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  if (error) {
    console.error("Supabase signInWithOtp error", {
      message: error.message,
      status: error.status,
      code: error.code,
      name: error.name,
      error,
    });
  }
  redirect(error ? "/login?error=send" : `/login?sent=1&email=${encodeURIComponent(email)}`);
}

async function verifyEmailCode(formData: FormData) {
  "use server";
  if (!hasSupabaseEnv()) redirect("/");
  const email = String(formData.get("email") ?? "").trim().toLocaleLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");
  if (!email || !/^\d{6,8}$/.test(token)) redirect(`/login?sent=1&email=${encodeURIComponent(email)}&error=code`);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    console.error("Supabase verifyOtp error", { message: error.message, status: error.status, code: error.code, name: error.name });
    redirect(`/login?sent=1&email=${encodeURIComponent(email)}&error=code`);
  }
  redirect("/");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; email?: string; error?: string }> }) {
  if (!hasSupabaseEnv()) redirect("/");
  const params = await searchParams;
  return <main className="grid min-h-dvh place-items-center bg-background p-5"><div className="w-full max-w-sm"><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-foreground">Peptime</p><h1 className="mt-3 text-3xl font-medium tracking-[-.04em]">Din privata logg</h1><p className="mt-3 leading-7 text-muted-foreground">Ange din e-post så skickar vi en säker inloggningslänk. Inget lösenord behövs.</p>{params.sent && <div className="mt-6 rounded-2xl border border-border bg-accent/40 p-4 text-sm">Kontrollera din inkorg. Öppnas länken i Safari kan du i stället ange engångskoden nedan direkt i Peptime.</div>}{params.error && <div className="mt-6 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{params.error==="code"?"Koden kunde inte verifieras. Kontrollera den och försök igen.":"Länken kunde inte skickas. Kontrollera adressen och försök igen."}</div>}{params.sent&&params.email?<form action={verifyEmailCode} className="mt-7 space-y-3"><input type="hidden" name="email" value={params.email}/><label className="text-xs text-muted-foreground">Engångskod<Input name="token" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={8} className="mt-2 h-13 rounded-xl bg-card px-4 text-center text-xl tracking-[.25em]" placeholder="000000"/></label><Button type="submit" className="h-14 w-full rounded-2xl text-base">Logga in i Peptime</Button></form>:<form action={sendMagicLink} className="mt-7 space-y-3"><label className="text-xs text-muted-foreground">E-post<Input name="email" type="email" autoComplete="email" required className="mt-2 h-13 rounded-xl bg-card px-4 text-base" placeholder="du@example.com"/></label><Button type="submit" className="h-14 w-full rounded-2xl text-base">Skicka magisk länk</Button></form>}<div className="mt-8 flex gap-3 rounded-2xl border border-border bg-card p-4"><ShieldCheck className="size-5 shrink-0 text-accent-foreground"/><p className="text-xs leading-5 text-muted-foreground">Log what you want. Peptime contains no medical advice.</p></div></div></main>;
}
