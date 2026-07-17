import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  syncProviderForStartup,
  validateStripe,
  validateMercury,
  validateAmplitude,
  type Provider,
} from "../_shared/integration-sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getStartupId(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  const { data: m } = await userClient
    .from("startup_members")
    .select("startup_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!m) return { error: "No startup" as const };
  return { startupId: m.startup_id as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { startupId, error } = await getStartupId(req);
    if (error) return json({ error }, 401);

    const body = await req.json();
    const action = body.action as "list" | "connect" | "disconnect" | "sync";
    const provider = body.provider as Provider | undefined;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "list") {
      const { data } = await admin
        .from("startup_integrations")
        .select("id, provider, status, account_label, last_synced_at, last_sync_error")
        .eq("startup_id", startupId);
      return json({ items: data ?? [] });
    }

    if (!provider) return json({ error: "provider required" }, 400);

    if (action === "disconnect") {
      await admin.from("startup_integrations").delete()
        .eq("startup_id", startupId).eq("provider", provider);
      return json({ ok: true });
    }

    if (action === "connect") {
      const apiKey = (body.api_key ?? "").trim();
      const apiSecret = (body.api_secret ?? "").trim();
      if (!apiKey) return json({ error: "api_key required" }, 400);

      let result;
      if (provider === "stripe") result = await validateStripe(apiKey);
      else if (provider === "mercury") result = await validateMercury(apiKey);
      else if (provider === "amplitude") {
        if (!apiSecret) return json({ error: "Amplitude requiere secret" }, 400);
        result = await validateAmplitude(apiKey, apiSecret);
      } else return json({ error: "unknown provider" }, 400);

      if (!result.ok) return json({ error: result.error }, 400);

      await admin.from("startup_integrations").delete()
        .eq("startup_id", startupId).eq("provider", provider);
      await admin.from("startup_integrations").insert({
        startup_id: startupId,
        provider,
        status: "connected",
        api_key: apiKey,
        api_secret: provider === "amplitude" ? apiSecret : null,
        account_label: result.label ?? null,
      });
      return json({ ok: true, label: result.label });
    }

    if (action === "sync") {
      const { data: integ } = await admin
        .from("startup_integrations")
        .select("api_key, api_secret")
        .eq("startup_id", startupId).eq("provider", provider).maybeSingle();
      if (!integ?.api_key) return json({ error: "Not connected" }, 400);

      try {
        await syncProviderForStartup(admin, startupId, provider, integ.api_key, integ.api_secret);
        await admin.from("startup_integrations").update({
          status: "connected",
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
        }).eq("startup_id", startupId).eq("provider", provider);
        return json({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin.from("startup_integrations").update({
          status: "error", last_sync_error: msg,
        }).eq("startup_id", startupId).eq("provider", provider);
        return json({ error: msg }, 500);
      }
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
