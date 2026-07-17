// Shared sync logic used by both the user-facing `integrations` function
// and the cron-triggered `sync-all-integrations` function.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Provider = "stripe" | "mercury" | "amplitude";

// ---- Validators ----
export async function validateStripe(apiKey: string) {
  const r = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) return { ok: false, error: `Stripe rechazó la key (${r.status})` };
  const acc = await r.json();
  return { ok: true, label: acc.business_profile?.name || acc.email || acc.id };
}

export async function validateMercury(apiKey: string) {
  const r = await fetch("https://api.mercury.com/api/v1/accounts", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) return { ok: false, error: `Mercury rechazó el token (${r.status})` };
  const data = await r.json();
  const count = data?.accounts?.length ?? 0;
  return { ok: true, label: `${count} cuenta${count === 1 ? "" : "s"}` };
}

export async function validateAmplitude(apiKey: string, secret: string) {
  const auth = btoa(`${apiKey}:${secret}`);
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://amplitude.com/api/2/users?m=active&start=${fmt(start)}&end=${fmt(end)}&i=1`;
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) return { ok: false, error: `Amplitude rechazó las credenciales (${r.status})` };
  return { ok: true, label: "Proyecto Amplitude" };
}

// ---- Metric upsert helper ----
async function upsertMetric(
  admin: SupabaseClient,
  startupId: string,
  metricName: string,
  value: number,
  source: Provider,
  period?: { year: number; month: number },
) {
  const { data: defs } = await admin
    .from("metric_definitions")
    .select("id, name")
    .ilike("name", metricName);
  const def = defs?.[0];
  if (!def) return;

  // Is metric configured for this startup?
  const { data: cfg } = await admin
    .from("metric_configs")
    .select("metric_id")
    .eq("startup_id", startupId)
    .eq("metric_id", def.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!cfg) return;

  const now = new Date();
  const period_year = period?.year ?? now.getUTCFullYear();
  const period_month = period?.month ?? now.getUTCMonth() + 1;

  await admin.from("metric_entries").delete()
    .eq("startup_id", startupId)
    .eq("metric_id", def.id)
    .eq("period_year", period_year)
    .eq("period_month", period_month);

  await admin.from("metric_entries").insert({
    startup_id: startupId,
    metric_id: def.id,
    period_year,
    period_month,
    value,
    source,
    synced_at: now.toISOString(),
  });
}

// ---- Stripe sync ----
async function fetchStripeAll(apiKey: string, path: string): Promise<any[]> {
  const out: any[] = [];
  let url = `https://api.stripe.com/v1/${path}${path.includes("?") ? "&" : "?"}limit=100`;
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) throw new Error(`Stripe ${path} failed: ${r.status}`);
    const data = await r.json();
    out.push(...(data.data ?? []));
    if (data.has_more && data.data.length) {
      const last = data.data[data.data.length - 1].id;
      url = `https://api.stripe.com/v1/${path}${path.includes("?") ? "&" : "?"}limit=100&starting_after=${last}`;
    } else url = "";
  }
  return out;
}

function priceToMonthlyCents(item: any): number {
  const price = item.price;
  if (!price?.unit_amount) return 0;
  const qty = item.quantity ?? 1;
  const interval = price.recurring?.interval;
  const intervalCount = price.recurring?.interval_count ?? 1;
  let monthly = price.unit_amount * qty;
  if (interval === "year") monthly = monthly / (12 * intervalCount);
  else if (interval === "week") monthly = monthly * (52 / 12) / intervalCount;
  else if (interval === "day") monthly = monthly * (365 / 12) / intervalCount;
  else monthly = monthly / intervalCount;
  return monthly;
}

export async function syncStripe(admin: SupabaseClient, startupId: string, apiKey: string) {
  const now = new Date();
  const monthStart = Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime() / 1000);
  const monthEnd = Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).getTime() / 1000);

  // Active subs → MRR + active customer count + ARPU
  const activeSubs = await fetchStripeAll(apiKey, "subscriptions?status=active");
  let mrrCents = 0;
  const activeCustomers = new Set<string>();
  let newMrrCents = 0;
  for (const s of activeSubs) {
    activeCustomers.add(s.customer);
    let subMrr = 0;
    for (const item of s.items?.data ?? []) subMrr += priceToMonthlyCents(item);
    mrrCents += subMrr;
    if (s.created >= monthStart && s.created < monthEnd) newMrrCents += subMrr;
  }

  // Canceled this month → churned MRR + churn rate
  const canceledSubs = await fetchStripeAll(apiKey, `subscriptions?status=canceled&canceled_at[gte]=${monthStart}&canceled_at[lt]=${monthEnd}`);
  let churnedMrrCents = 0;
  for (const s of canceledSubs) {
    for (const item of s.items?.data ?? []) churnedMrrCents += priceToMonthlyCents(item);
  }

  // Monthly revenue from paid invoices
  const invoices = await fetchStripeAll(apiKey, `invoices?status=paid&created[gte]=${monthStart}&created[lt]=${monthEnd}`);
  const revenueCents = invoices.reduce((sum, inv) => sum + (inv.amount_paid ?? 0), 0);

  const mrr = mrrCents / 100;
  const newMrr = newMrrCents / 100;
  const churnedMrr = churnedMrrCents / 100;
  const netNewMrr = newMrr - churnedMrr;
  const revenue = revenueCents / 100;
  const arpu = activeCustomers.size > 0 ? mrr / activeCustomers.size : 0;
  // Churn rate based on active count at start of month (approximation: active + canceled-this-month)
  const baseSubs = activeSubs.length + canceledSubs.length;
  const churnRate = baseSubs > 0 ? (canceledSubs.length / baseSubs) * 100 : 0;

  await upsertMetric(admin, startupId, "Revenue", revenue, "stripe");
  await upsertMetric(admin, startupId, "Nuevo MRR", newMrr, "stripe");
  await upsertMetric(admin, startupId, "MRR Perdido (Churn)", churnedMrr, "stripe");
  await upsertMetric(admin, startupId, "Net New MRR", netNewMrr, "stripe");
  await upsertMetric(admin, startupId, "Churn Rate", churnRate, "stripe");
  await upsertMetric(admin, startupId, "ARPU", arpu, "stripe");
}

// ---- Mercury sync ----
export async function syncMercury(admin: SupabaseClient, startupId: string, apiKey: string) {
  const accR = await fetch("https://api.mercury.com/api/v1/accounts", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!accR.ok) throw new Error(`Mercury accounts failed: ${accR.status}`);
  const accData = await accR.json();
  const accounts = accData.accounts ?? [];
  const cash = accounts.reduce((s: number, a: any) => s + (a.currentBalance ?? 0), 0);

  // Burn = avg net outflows over last 3 full months
  const now = new Date();
  const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  const start = threeMonthsAgo.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);

  let totalNet = 0;
  for (const acc of accounts) {
    const txR = await fetch(
      `https://api.mercury.com/api/v1/account/${acc.id}/transactions?start=${start}&end=${end}&limit=500`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!txR.ok) continue;
    const txData = await txR.json();
    for (const tx of txData.transactions ?? []) {
      totalNet += tx.amount ?? 0; // signed: negative=outflow
    }
  }
  const monthlyNet = totalNet / 3;
  const burn = monthlyNet < 0 ? -monthlyNet : 0;
  const runway = burn > 0 ? cash / burn : 0;

  await upsertMetric(admin, startupId, "Cash en Banco", cash, "mercury");
  if (burn > 0) await upsertMetric(admin, startupId, "Burn Mensual", burn, "mercury");
  if (runway > 0) await upsertMetric(admin, startupId, "Runway", runway, "mercury");
}

// ---- Amplitude sync ----
export async function syncAmplitude(admin: SupabaseClient, startupId: string, apiKey: string, secret: string) {
  const auth = btoa(`${apiKey}:${secret}`);
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://amplitude.com/api/2/users?m=active&start=${fmt(start)}&end=${fmt(end)}&i=30`;
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) throw new Error(`Amplitude failed: ${r.status}`);
  const data = await r.json();
  const series = data?.data?.series?.[0];
  const mau = Array.isArray(series) && series.length > 0 ? series[series.length - 1] : 0;
  await upsertMetric(admin, startupId, "Usuarios Activos", mau, "amplitude");
}

// ---- Top-level dispatcher ----
export async function syncProviderForStartup(
  admin: SupabaseClient,
  startupId: string,
  provider: Provider,
  apiKey: string,
  apiSecret: string | null,
) {
  if (provider === "stripe") return syncStripe(admin, startupId, apiKey);
  if (provider === "mercury") return syncMercury(admin, startupId, apiKey);
  if (provider === "amplitude") return syncAmplitude(admin, startupId, apiKey, apiSecret ?? "");
}
