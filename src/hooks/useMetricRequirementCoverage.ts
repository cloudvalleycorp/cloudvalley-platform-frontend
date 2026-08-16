import { useQuery } from "@tanstack/react-query";
import { LIST_METRIC_REQUIREMENT_COVERAGE_URL, type MetricRequirementCoverage } from "@/lib/metricRequirements";

async function fetchCoverage(): Promise<MetricRequirementCoverage[]> {
  const res = await fetch(LIST_METRIC_REQUIREMENT_COVERAGE_URL, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.coverage) ? (data.coverage as MetricRequirementCoverage[]) : [];
}

export function useMetricRequirementCoverage() {
  const { data: coverage = [], isLoading: loading } = useQuery({
    queryKey: ["metric-requirement-coverage"],
    queryFn: fetchCoverage,
  });
  return { coverage, loading };
}
