-- 1) Tabla de invitaciones
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  invited_by uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

-- Email lowercase + único pendiente por org+email
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_unique_pending
  ON public.organization_invitations (organization_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS organization_invitations_email_idx
  ON public.organization_invitations (lower(email));

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Helper: ¿puede el usuario invitar a esta org?
CREATE OR REPLACE FUNCTION public.can_invite_to_org(_user_id uuid, _organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.startup_organizations so
      JOIN public.startup_members sm ON sm.startup_id = so.startup_id
      WHERE so.organization_id = _organization_id
        AND sm.user_id = _user_id
    )
$$;

-- RLS Policies
CREATE POLICY "Admins manage all invitations"
ON public.organization_invitations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Founders read invitations for their orgs"
ON public.organization_invitations
FOR SELECT
TO authenticated
USING (
  public.can_invite_to_org(auth.uid(), organization_id)
);

CREATE POLICY "Founders create invitations for their orgs"
ON public.organization_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_invite_to_org(auth.uid(), organization_id)
  AND invited_by = auth.uid()
);

CREATE POLICY "Founders revoke their own invitations"
ON public.organization_invitations
FOR UPDATE
TO authenticated
USING (invited_by = auth.uid())
WITH CHECK (invited_by = auth.uid());

-- 2) Función para aceptar invitaciones pendientes al primer login
CREATE OR REPLACE FUNCTION public.accept_pending_invitations(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  has_any boolean := false;
BEGIN
  FOR inv IN
    SELECT id, organization_id
    FROM public.organization_invitations
    WHERE lower(email) = lower(_email)
      AND status = 'pending'
  LOOP
    has_any := true;

    -- Vincular como viewer de la organización (idempotente)
    INSERT INTO public.organization_members (user_id, organization_id, role)
    VALUES (_user_id, inv.organization_id, 'viewer')
    ON CONFLICT DO NOTHING;

    -- Marcar invitación como aceptada
    UPDATE public.organization_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;
  END LOOP;

  IF has_any THEN
    -- Asignar rol org_viewer
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'org_viewer'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- 3) Reemplazar handle_new_user para procesar invitaciones
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_invites boolean;
BEGIN
  -- Crear profile
  INSERT INTO public.profiles (id, name, email)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'name', ''), new.email)
  ON CONFLICT (id) DO NOTHING;

  -- ¿Tiene invitaciones pendientes?
  SELECT EXISTS (
    SELECT 1 FROM public.organization_invitations
    WHERE lower(email) = lower(new.email) AND status = 'pending'
  ) INTO has_invites;

  IF has_invites THEN
    -- Procesar invitaciones (asigna org_viewer + vincula a orgs)
    PERFORM public.accept_pending_invitations(new.id, new.email);
  ELSE
    -- Default: founder
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'founder'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

-- Asegurar que el trigger existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Constraint único en organization_members para soportar ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_members_user_org_unique'
  ) THEN
    ALTER TABLE public.organization_members
    ADD CONSTRAINT organization_members_user_org_unique UNIQUE (user_id, organization_id);
  END IF;
END $$;

-- Constraint único en user_roles para soportar ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_roles_user_role_unique'
  ) THEN
    ALTER TABLE public.user_roles
    ADD CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role);
  END IF;
END $$;