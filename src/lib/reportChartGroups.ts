// Agrupado de KPIs por unidad para los gráficos del reporte (opción A aprobada):
// un gráfico por unidad, para no mezclar escalas. Lo usan el PDF y la app, así
// que las dos muestran los mismos grupos.

// "$" y "USD" son la misma unidad: comparten gráfico.
export function unitGroupKey(unit: string | null): string {
  if (unit === "$" || unit === "USD") return "USD";
  if (unit === "%") return "%";
  return unit && unit.trim() ? unit : "Sin unidad";
}

export type UnitGroup<T> = { key: string; items: T[] };

// Agrupa por unidad conservando el orden de aparición.
export function groupByUnit<T extends { unit: string | null }>(items: T[]): UnitGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = unitGroupKey(item.unit);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, items: list }));
}

// Color de cada serie, por posición dentro de su grupo. Misma paleta en PDF y app.
export const SERIES_COLORS = ["#B8402B", "#165ECA", "#5A5A70", "#147B72"];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
