import { PeptimeApp } from "@/components/peptime-app";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  if (hasSupabaseEnv()) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/login");
  }
  return <PeptimeApp />;
}
