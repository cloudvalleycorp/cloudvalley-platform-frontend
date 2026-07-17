import { useEffect, useState } from "react";
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

export function useStartup() {
  const { user } = useAuth();
  const [startup, setStartup] = useState<Startup | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    if (!user) {
      setStartup(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: members } = await supabase
      .from("startup_members")
      .select("startup_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!members) {
      setStartup(null);
      setLoading(false);
      return;
    }

    const { data: s } = await supabase
      .from("startups")
      .select("*")
      .eq("id", members.startup_id)
      .maybeSingle();

    setStartup(s as Startup | null);
    setLoading(false);
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { startup, loading, refetch };
}
