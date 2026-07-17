
CREATE TABLE public.document_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  startup_id uuid NOT NULL,
  document_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

CREATE INDEX idx_document_requests_startup ON public.document_requests(startup_id, status);
CREATE INDEX idx_document_requests_doc ON public.document_requests(document_id);

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

-- Founders (startup members) can read requests for their startup
CREATE POLICY "Members read their document requests"
ON public.document_requests
FOR SELECT
TO authenticated
USING (public.is_startup_member(auth.uid(), startup_id));

-- Founders can update (mark resolved/dismissed) requests for their startup
CREATE POLICY "Members update their document requests"
ON public.document_requests
FOR UPDATE
TO authenticated
USING (public.is_startup_member(auth.uid(), startup_id));

-- Org members can read requests they made (for their org)
CREATE POLICY "Org members read their requests"
ON public.document_requests
FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

-- Org members can create requests for startups linked to their org
CREATE POLICY "Org members create requests"
ON public.document_requests
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND public.is_organization_member(auth.uid(), organization_id)
  AND EXISTS (
    SELECT 1 FROM public.startup_organizations so
    WHERE so.startup_id = document_requests.startup_id
      AND so.organization_id = document_requests.organization_id
  )
);

-- Admins manage all
CREATE POLICY "Admins manage all document requests"
ON public.document_requests
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
