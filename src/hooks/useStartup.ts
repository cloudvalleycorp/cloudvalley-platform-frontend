import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type Startup = {
  id: string;
  name: string;
  stage: "pre_seed" | "seed" | "series_a" | null;
  business_model: string | null;
  industry: string | null;
  target_raise_usd: number | null;
  readiness_score: number;
  cohort_number: number | null;
  cohort_year: number | null;
  website: string | null;
};

async function fetchStartup(userId: string): Promise<Startup | null> {
  const { data: members } = await supabase
    .from("startup_members")
    .select("startup_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!members) return null;

  const { data: s } = await supabase
    .from("startups")
    .select("*")
    .eq("id", members.startup_id)
    .maybeSingle();

  return s as Startup | null;
}

export function useStartup() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: startup, isLoading } = useQuery({
    queryKey: ["startup", user?.id],
    queryFn: () => fetchStartup(user!.id),
    enabled: !!user,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["startup", user?.id] });

  return { startup: startup ?? null, loading: isLoading, refetch };
}
