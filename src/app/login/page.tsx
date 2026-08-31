import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { ShieldCheck } from "lucide-react";

async function sendMagicLink(formData: FormData) {
  "use server";
  if (!hasSupabaseEnv()) redirect("/");
  const email = String(formData.get("email") ?? "").trim();
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
  redirect(error ? "/login?error=send" : "/login?sent=1");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  if (!hasSupabaseEnv()) redirect("/");
  const params = await searchParams;
  return <main className="grid min-h-dvh place-items-center bg-background p-5"><div className="w-full max-w-sm"><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent-foreground">Peptime</p><h1 className="mt-3 text-3xl font-medium tracking-[-.04em]">Din privata logg</h1><p className="mt-3 leading-7 text-muted-foreground">Ange din e-post så skickar vi en säker inloggningslänk. Inget lösenord behövs.</p>{params.sent && <div className="mt-6 rounded-2xl border border-border bg-accent/40 p-4 text-sm">Kontrollera din inkorg. Länken kan ta någon minut.</div>}{params.error && <div className="mt-6 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">Länken kunde inte skickas. Kontrollera adressen och försök igen.</div>}<form action={sendMagicLink} className="mt-7 space-y-3"><label className="text-xs text-muted-foreground">E-post<Input name="email" type="email" autoComplete="email" required className="mt-2 h-13 rounded-xl bg-card px-4 text-base" placeholder="du@example.com"/></label><Button type="submit" className="h-14 w-full rounded-2xl text-base">Skicka magisk länk</Button></form><div className="mt-8 flex gap-3 rounded-2xl border border-border bg-card p-4"><ShieldCheck className="size-5 shrink-0 text-accent-foreground"/><p className="text-xs leading-5 text-muted-foreground">Log what you want. Peptime contains no medical advice.</p></div></div></main>;
}
