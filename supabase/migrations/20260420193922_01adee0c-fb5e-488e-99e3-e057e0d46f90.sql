-- Fix function search_path
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tighten startup insert policy: require user to be authenticated
drop policy if exists "Authenticated create startups" on public.startups;
create policy "Authenticated create startups" on public.startups
  for insert to authenticated with check (auth.uid() is not null);
