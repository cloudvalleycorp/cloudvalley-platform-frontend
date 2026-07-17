CREATE TABLE public.connection_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  batch text,
  year integer,
  requested_by uuid,
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX connection_requests_unique_pending
  ON public.connection_requests (startup_id, organization_id)
  WHERE status = 'pending';

CREATE INDEX connection_requests_org_idx ON public.connection_requests (organization_id, status);
CREATE INDEX connection_requests_startup_idx ON public.connection_requests (startup_id, status);

ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all connection requests"
  ON public.connection_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Startup members read their requests"
  ON public.connection_requests FOR SELECT TO authenticated
  USING (public.is_startup_member(auth.uid(), startup_id));

CREATE POLICY "Startup members create requests"
  ON public.connection_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_startup_member(auth.uid(), startup_id) AND requested_by = auth.uid());

CREATE POLICY "Startup members update their requests"
  ON public.connection_requests FOR UPDATE TO authenticated
  USING (public.is_startup_member(auth.uid(), startup_id))
  WITH CHECK (public.is_startup_member(auth.uid(), startup_id));

CREATE POLICY "Org members read requests to their orgs"
  ON public.connection_requests FOR SELECT TO authenticated
  USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Org members update requests to their orgs"
  ON public.connection_requests FOR UPDATE TO authenticated
  USING (public.is_organization_member(auth.uid(), organization_id))
  WITH CHECK (public.is_organization_member(auth.uid(), organization_id));