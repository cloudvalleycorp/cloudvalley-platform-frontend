import { describe, it, expect } from "vitest";
import type { MetricHighlight } from "@/lib/metricIntelligence";
import { visibleHighlights } from "@/lib/metricIntelligence";

function highlight(description: unknown): MetricHighlight {
  return {
    metric_id: "arr",
    title: "ARR",
    description: description as string,
    delta: { current_value: 1, prior_value: 1, delta_pct: 0 },
    confidence: { basis: "x", method: "statistical", score: 1 },
    evidence: [],
  } as MetricHighlight;
}

describe("visibleHighlights", () => {
  it("muestra los highlights con texto tal cual llegan", () => {
    const list = [highlight("El ARR se mantuvo en 1.659.600.")];
    expect(visibleHighlights(list)).toEqual(list);
  });

  it("omite los highlights sin texto válido, sin error", () => {
    const list = [highlight(""), highlight("   "), highlight(null), highlight("El MRR creció.")];
    expect(visibleHighlights(list).map((h) => h.description)).toEqual(["El MRR creció."]);
  });

  it("una lista sin texto válido queda vacía, no es un error", () => {
    expect(visibleHighlights([highlight("")])).toEqual([]);
    expect(visibleHighlights([])).toEqual([]);
  });
});
