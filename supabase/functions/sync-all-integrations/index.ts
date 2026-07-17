// Cron-invoked. Loops every connected integration and syncs it.
// No JWT required — protected by being only called from inside the DB via pg_cron.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { syncProviderForStartup, type Provider } from "../_shared/integration-sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: integrations } = await admin
    .from("startup_integrations")
    .select("startup_id, provider, api_key, api_secret")
    .in("status", ["connected", "error"]);

  const results: Array<{ startup_id: string; provider: string; ok: boolean; error?: string }> = [];

  for (const integ of integrations ?? []) {
    if (!integ.api_key) continue;
    try {
      await syncProviderForStartup(
        admin,
        integ.startup_id,
        integ.provider as Provider,
        integ.api_key,
        integ.api_secret,
      );
      await admin.from("startup_integrations").update({
        status: "connected",
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      }).eq("startup_id", integ.startup_id).eq("provider", integ.provider);
      results.push({ startup_id: integ.startup_id, provider: integ.provider, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("startup_integrations").update({
        status: "error", last_sync_error: msg,
      }).eq("startup_id", integ.startup_id).eq("provider", integ.provider);
      results.push({ startup_id: integ.startup_id, provider: integ.provider, ok: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ count: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
