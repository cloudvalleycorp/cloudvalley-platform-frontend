
-- Add org_viewer to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'org_viewer';

-- organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('fund', 'accelerator', 'both')),
  logo_url text,
  website text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read active organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert organizations"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update organizations"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete organizations"
  ON public.organizations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- organization_members
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Helper function to check org membership without recursion
CREATE OR REPLACE FUNCTION public.is_organization_member(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _organization_id
  )
$$;

CREATE OR REPLACE FUNCTION public.user_organization_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id
$$;

CREATE POLICY "Users read own org memberships"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage org memberships"
  ON public.organization_members FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- startup_organizations
CREATE TABLE public.startup_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id uuid NOT NULL REFERENCES public.startups(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch text,
  year integer,
  relationship_type text CHECK (relationship_type IN ('portfolio', 'accelerated', 'both')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (startup_id, organization_id)
);

ALTER TABLE public.startup_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their startup orgs"
  ON public.startup_organizations FOR SELECT
  TO authenticated
  USING (public.is_startup_member(auth.uid(), startup_id));

CREATE POLICY "Org members read linked startups"
  ON public.startup_organizations FOR SELECT
  TO authenticated
  USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins read all startup orgs"
  ON public.startup_organizations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members manage their startup orgs"
  ON public.startup_organizations FOR ALL
  TO authenticated
  USING (public.is_startup_member(auth.uid(), startup_id))
  WITH CHECK (public.is_startup_member(auth.uid(), startup_id));

-- metric_privacy
CREATE TABLE public.metric_privacy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id uuid NOT NULL REFERENCES public.startups(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.metric_definitions(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  UNIQUE (startup_id, metric_id)
);

ALTER TABLE public.metric_privacy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their metric privacy"
  ON public.metric_privacy FOR ALL
  TO authenticated
  USING (public.is_startup_member(auth.uid(), startup_id))
  WITH CHECK (public.is_startup_member(auth.uid(), startup_id));

CREATE POLICY "Org members read public metric privacy"
  ON public.metric_privacy FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.startup_organizations so
      WHERE so.startup_id = metric_privacy.startup_id
      AND public.is_organization_member(auth.uid(), so.organization_id)
    )
  );

CREATE POLICY "Admins read all metric privacy"
  ON public.metric_privacy FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- document_privacy
CREATE TABLE public.document_privacy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id uuid NOT NULL REFERENCES public.startups(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT true,
  UNIQUE (startup_id, document_id)
);

ALTER TABLE public.document_privacy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their document privacy"
  ON public.document_privacy FOR ALL
  TO authenticated
  USING (public.is_startup_member(auth.uid(), startup_id))
  WITH CHECK (public.is_startup_member(auth.uid(), startup_id));

CREATE POLICY "Org members read public document privacy"
  ON public.document_privacy FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.startup_organizations so
      WHERE so.startup_id = document_privacy.startup_id
      AND public.is_organization_member(auth.uid(), so.organization_id)
    )
  );

CREATE POLICY "Admins read all document privacy"
  ON public.document_privacy FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX idx_startup_orgs_startup ON public.startup_organizations(startup_id);
CREATE INDEX idx_startup_orgs_org ON public.startup_organizations(organization_id);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
