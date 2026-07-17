## Goal

Let each startup connect **Stripe**, **Mercury**, and **Amplitude** so revenue, cash, and product metrics flow into their dashboard automatically — no manual entry.

## What each integration unlocks

| Provider | Auth method | Metrics auto-filled |
|---|---|---|
| **Stripe** | OAuth (Stripe Connect) | MRR, ARR, new MRR, churned MRR, active customers, new customers, ARPU, gross revenue |
| **Mercury** | API key (Mercury has no OAuth — founders generate a read-only key in Mercury settings) | Cash balance, monthly burn, runway (months), inflows, outflows |
| **Amplitude** | API key + Secret key (per project) | DAU, WAU, MAU, retention, key event counts |

Note on Mercury: Mercury doesn't offer OAuth, so each founder pastes a read-only API token. We'll store it encrypted and explain in-UI exactly where to find it.

## Architecture (per-user, multi-tenant)

Each startup connects their *own* accounts — not yours. Tokens are scoped per `startup_id`.

**New table: `startup_integrations`**
- `startup_id`, `provider` (stripe | mercury | amplitude)
- `status` (connected | error | disconnected)
- `access_token`, `refresh_token`, `expires_at` (encrypted, for OAuth)
- `api_key_encrypted` (for Mercury / Amplitude)
- `account_id`, `account_label` (e.g. Stripe account name)
- `last_synced_at`, `last_sync_error`
- Unique on (`startup_id`, `provider`)
- RLS: only startup members can read/write their own rows; tokens never returned to client

**New table: `metric_source_mapping`**
- Maps a `metric_id` → `provider` + `field` so we know which metrics are auto-filled vs manual
- Lets the UI show a "Live · synced 2h ago" badge

**Edge functions**
1. `stripe-oauth-start` — returns Stripe Connect authorize URL
2. `stripe-oauth-callback` — exchanges code, stores tokens
3. `integration-connect` — saves Mercury/Amplitude API keys (validates on save)
4. `integration-disconnect` — revokes + deletes tokens
5. `sync-stripe` / `sync-mercury` / `sync-amplitude` — pull latest values, upsert into `metric_entries` for current period
6. `sync-all` — scheduled job (pg_cron, every 6h) that loops all connected startups

**UI changes**
- New **Integrations** section in `Settings.tsx` with three cards (Stripe / Mercury / Amplitude), each showing: status, last sync time, connect/disconnect button, "Sync now" action
- Badge on auto-synced metrics in `Metrics.tsx` ("Live · Stripe")
- Auto-synced metrics become read-only (manual override still possible with a confirmation)

## Phased rollout

**Phase 1 — Stripe** (biggest impact)
- Stripe OAuth flow, sync MRR/ARR/customers/churn
- Settings UI + metric badges
- Scheduled sync every 6h

**Phase 2 — Mercury**
- API-key flow with in-UI instructions ("Mercury → Settings → API tokens → read-only")
- Sync cash balance + compute burn/runway from last 3 months of transactions

**Phase 3 — Amplitude**
- API key + Secret per project
- Sync DAU/WAU/MAU + retention via Dashboard REST API

## What you need to provide before Phase 1

1. **Stripe Connect OAuth credentials** — you create one Stripe Connect app at dashboard.stripe.com/settings/connect. We'll need:
   - `STRIPE_CONNECT_CLIENT_ID`
   - `STRIPE_SECRET_KEY` (your platform key)
2. Confirm sync cadence (suggested: every 6h)

For Phase 2/3 nothing platform-side is needed — each founder brings their own API key.

## Security notes

- All tokens stored server-side only, encrypted via pgsodium or Supabase Vault
- Tokens never sent to the client; only `status` + `last_synced_at` + masked label
- Sync edge functions run with service role; RLS prevents cross-tenant reads
- API key validation on save (test request) so users get instant feedback if the key is wrong

Ready to start with Phase 1 (Stripe) when you approve. Want me to also scaffold the Mercury + Amplitude UI cards as "Coming soon" in the same pass, or build them one phase at a time?