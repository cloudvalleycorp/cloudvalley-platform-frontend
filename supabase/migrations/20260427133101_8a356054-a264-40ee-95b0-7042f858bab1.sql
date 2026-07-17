
-- Helper: is the given startup linked to any organization the user belongs to?
CREATE OR REPLACE FUNCTION public.is_startup_in_user_orgs(_user_id uuid, _startup_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.startup_organizations so
    JOIN public.organization_members om
      ON om.organization_id = so.organization_id
    WHERE so.startup_id = _startup_id
      AND om.user_id = _user_id
  )
$$;

-- startups: org viewers can read linked startups
CREATE POLICY "Org viewers read linked startups"
  ON public.startups FOR SELECT
  TO authenticated
  USING (public.is_startup_in_user_orgs(auth.uid(), id));

-- metric_entries: org viewers can read entries only if the metric is marked public
-- Default behaviour: if there is NO row in metric_privacy for (startup, metric), treat as public.
CREATE POLICY "Org viewers read public metric entries"
  ON public.metric_entries FOR SELECT
  TO authenticated
  USING (
    public.is_startup_in_user_orgs(auth.uid(), startup_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.metric_privacy mp
      WHERE mp.startup_id = metric_entries.startup_id
        AND mp.metric_id = metric_entries.metric_id
        AND mp.is_public = false
    )
  );

-- documents: org viewers can read docs only if not explicitly private
CREATE POLICY "Org viewers read public documents"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    public.is_startup_in_user_orgs(auth.uid(), startup_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.document_privacy dp
      WHERE dp.startup_id = documents.startup_id
        AND dp.document_id = documents.id
        AND dp.is_public = false
    )
  );

-- startup_tasks: org viewers can read all roadmap progress
CREATE POLICY "Org viewers read startup tasks"
  ON public.startup_tasks FOR SELECT
  TO authenticated
  USING (public.is_startup_in_user_orgs(auth.uid(), startup_id));

-- score_snapshots: org viewers can read
CREATE POLICY "Org viewers read score snapshots"
  ON public.score_snapshots FOR SELECT
  TO authenticated
  USING (public.is_startup_in_user_orgs(auth.uid(), startup_id));

-- metric_configs: org viewers can read which metrics are active for a startup
CREATE POLICY "Org viewers read metric configs"
  ON public.metric_configs FOR SELECT
  TO authenticated
  USING (public.is_startup_in_user_orgs(auth.uid(), startup_id));
