CREATE OR REPLACE FUNCTION public.create_startup_with_member(
  _name text,
  _industry text,
  _stage startup_stage,
  _business_model business_model,
  _target_raise_usd numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.startups (name, industry, stage, business_model, target_raise_usd)
  VALUES (_name, _industry, _stage, _business_model, _target_raise_usd)
  RETURNING id INTO new_id;

  INSERT INTO public.startup_members (startup_id, user_id, role)
  VALUES (new_id, auth.uid(), 'founder');

  RETURN new_id;
END;
$$;