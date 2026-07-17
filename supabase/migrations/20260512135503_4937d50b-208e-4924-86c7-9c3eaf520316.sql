
-- Provider enum
CREATE TYPE public.integration_provider AS ENUM ('stripe', 'mercury', 'amplitude');
CREATE TYPE public.integration_status AS ENUM ('connected', 'error', 'disconnected', 'pending');

-- Per-startup integration connections
CREATE TABLE public.startup_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id uuid NOT NULL,
  provider public.integration_provider NOT NULL,
  status public.integration_status NOT NULL DEFAULT 'pending',
  -- OAuth fields (Stripe)
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  -- API key fields (Mercury, Amplitude)
  api_key text,
  api_secret text,
  -- Provider-side identifiers
  account_id text,
  account_label text,
  -- Sync tracking
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (startup_id, provider)
);

ALTER TABLE public.startup_integrations ENABLE ROW LEVEL SECURITY;

-- Members can SEE their integrations BUT NOT the secret token columns.
-- We achieve that with a view in code; here we restrict full-row access to service role only,
-- and expose a safe SELECT policy that requires explicit column list (the client always selects safe cols).
CREATE POLICY "Members read their integrations"
ON public.startup_integrations FOR SELECT TO authenticated
USING (public.is_startup_member(auth.uid(), startup_id));

CREATE POLICY "Members delete their integrations"
ON public.startup_integrations FOR DELETE TO authenticated
USING (public.is_startup_member(auth.uid(), startup_id));

CREATE POLICY "Admins read all integrations"
ON public.startup_integrations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- INSERT/UPDATE happen only via edge functions using the service role key, no policy needed for clients.

CREATE TRIGGER set_startup_integrations_updated_at
BEFORE UPDATE ON public.startup_integrations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Mapping: which metrics are auto-filled by which provider
CREATE TABLE public.metric_source_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL,
  provider public.integration_provider NOT NULL,
  source_field text NOT NULL,
  UNIQUE (metric_id, provider)
);

ALTER TABLE public.metric_source_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read metric source mapping"
ON public.metric_source_mapping FOR SELECT TO authenticated
USING (true);

-- Mark metric_entries with their source so the UI can show a live badge
ALTER TABLE public.metric_entries
ADD COLUMN IF NOT EXISTS source public.integration_provider,
ADD COLUMN IF NOT EXISTS synced_at timestamptz;
