import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormActions } from "@/components/FormActions";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, AlertTriangle, Combine } from "lucide-react";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import { handleMembershipError } from "@/lib/membership";
import { normalizeCategory, slugify } from "@/hooks/useMetricPropertyForm";
import { UPSERT_FINANCIAL_METRIC_DEFINITION_URL } from "@/lib/financialReports";
import { findPossibleDuplicates } from "@/lib/metricSimilarity";
import { wrapInArithmetic } from "@/lib/querySpec";
import type { SuggestedMetric, MetricNeedingMoreData } from "@/lib/aiInsights";
import type { MetricDef } from "@/lib/metrics";

type ReviewRow = SuggestedMetric & {
  approved: boolean;
  possibleDuplicate: MetricDef | null;
  // true cuando el duplicado se descubrió recién al guardar (409 real de
  // upsert-metric-definition), no antes vía findPossibleDuplicates — cambia
  // el texto del aviso (2026-09-01: antes esto solo mostraba un toast de
  // error y cerraba el paso, sin dar la opción correcta de sumar la fuente
  // nueva a la métrica que ya existía — ver comentario en handleConfirm).
  duplicateFromServer?: boolean;
  combining?: boolean;
};

type Props = {
  suggestions: SuggestedMetric[];
  // Métricas que la IA hubiera necesitado inventar un supuesto de negocio
  // (margen, tasa) para proponer sin datos reales — se muestran como
  // referencia, nunca se completan solas del lado frontend.
  needingMoreData: MetricNeedingMoreData[];
  companyId: string | null;
  allMetrics: MetricDef[];
  categories: { id: string; label: string }[];
  defaultCategory: string;
  // La IA solo propone (ver aiInsights.ts) — esto recién persiste algo real
  // al confirmar, vía upsert-metric-definition (el mismo endpoint que ya usa
  // MetricPropertyPanel). Después recarga el catálogo.
  onSaved: () => void;
  // El wizard cierra recién cuando este paso termina (guardado u omitido) —
  // este componente ya no es un modal aparte, es el contenido del paso
  // "Confirmar métricas" (ver GrowthTrackerSheets.tsx, step 5).
  onDone: () => void;
};

// Revisión de lo que devuelve analyze-transactional-sheet (paso "Analizar
// con IA" del wizard de Sheets, GrowthTrackerSheets.tsx). Desde el cambio de
// contrato 2026-08-14, suggested_metrics trae query (QuerySpec estructurado)
// en vez de formula_expression de texto libre, así que ahora sí se puede
// confirmar directo acá contra upsert-metric-definition — antes del cambio
// esto quedaba bloqueado (ver historial de este archivo). La query se
// muestra de solo lectura vía QuerySummary; si el usuario quiere ajustarla
// (no solo nombre/categoría/descripción/unidad), lo hace después desde
// "Editar métrica" con el query builder completo.
export function SuggestedMetricsReview({
  suggestions,
  needingMoreData,
  companyId,
  allMetrics,
  categories,
  defaultCategory,
  onSaved,
  onDone,
}: Props) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(
      suggestions.map((s) => {
        // Filtro determinístico previo al 409 real de backend (dedup
        // universal, ver useMetricPropertyForm.ts) — atrapa variantes de
        // formato/substring ("Revenue" ⊂ "Revenue USD") ANTES de
        // desperdiciar un guardado. No atrapa sinónimos entre idiomas
        // ("Sales"/"Ingresos" vs "Revenue") — eso lo hace el 409 real.
        const possibleDuplicate = findPossibleDuplicates(s.name, allMetrics)[0] ?? null;
        return { ...s, approved: !possibleDuplicate, category: s.category?.trim() || defaultCategory, possibleDuplicate };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, defaultCategory]);

  const setRow = (i: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const approvedCount = rows.filter((r) => r.approved).length;

  const handleConfirm = async () => {
    if (!companyId) return;
    if (rows.filter((r) => r.approved && r.name.trim()).length === 0) {
      onDone();
      return;
    }
    setSaving(true);
    const existingIds = new Set(allMetrics.map((m) => m.id));
    let savedCount = 0;
    let pendingDuplicateCount = 0;
    let failedSilently = 0;
    const rowErrorMessages: string[] = [];
    const nextRows: ReviewRow[] = [];

    for (const row of rows) {
      if (!row.approved || !row.name.trim()) {
        nextRows.push(row);
        continue;
      }
      const category = normalizeCategory(row.category, categories);
      if (!category) {
        nextRows.push(row);
        continue;
      }
      const base = slugify(row.name);
      let slug = base;
      let suffix = 2;
      while (existingIds.has(slug)) {
        slug = `${base}_${suffix}`;
        suffix++;
      }
      const displayOrder =
        Math.max(0, ...allMetrics.filter((m) => m.category === category).map((m) => m.order_index)) + 1;
      const body: Record<string, unknown> = {
        company_id: companyId,
        metric_id: slug,
        name: row.name.trim(),
        category,
        metric_type: "calculated",
        unit: row.unit.trim() || null,
        display_order: displayOrder,
        query: row.query,
      };
      if (row.description.trim()) body.description = row.description.trim();
      if (row.why_it_matters.trim()) body.why_it_matters = row.why_it_matters.trim();
      try {
        const res = await fetch(UPSERT_FINANCIAL_METRIC_DEFINITION_URL, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        // Solo el 401 (sesión vencida) es un error sistémico real que
        // justifica frenar el lote entero (handleMembershipError redirige a
        // /login). Cualquier otro status (409 dedup, 400 validación, etc.)
        // es un problema de ESTA fila puntual — se reporta con el mensaje
        // real del backend y se sigue con el resto, nunca se deja el paso
        // trabado sin poder cerrarse.
        if (res.status === 401) {
          await handleMembershipError(res);
          setSaving(false);
          setRows(nextRows.concat(rows.slice(nextRows.length)));
          return;
        }
        if (res.ok) {
          existingIds.add(slug);
          savedCount++;
          continue; // fila resuelta, no vuelve a mostrarse
        }
        // 409 con existing_metric_id resoluble: en vez de solo avisar y
        // seguir (comportamiento viejo — el usuario terminaba sin ninguna
        // acción real más que reintentar con otro nombre), se ofrece
        // "Combinar" para sumar esta fuente a la métrica que ya existe en
        // vez de crear un duplicado. Encontrado en vivo 2026-09-01: subir el
        // mismo tipo de hoja varias veces (ej. un desglose mensual repetido)
        // proponía una métrica nueva cada vez — con 10 archivos similares,
        // 10 métricas "Monto Total" en conflicto, ninguna combinable desde
        // acá.
        if (res.status === 409) {
          const data = await res.json().catch(() => null);
          const existingId = typeof data?.existing_metric_id === "string" ? data.existing_metric_id : null;
          const target = existingId ? allMetrics.find((m) => m.id === existingId) ?? null : null;
          if (target) {
            pendingDuplicateCount++;
            nextRows.push({ ...row, possibleDuplicate: target, duplicateFromServer: true });
            continue;
          }
          rowErrorMessages.push(typeof data?.error === "string" ? data.error : `"${row.name}" no se pudo guardar.`);
          nextRows.push(row);
          continue;
        }
        const data = await res.json().catch(() => null);
        rowErrorMessages.push(typeof data?.error === "string" ? data.error : `"${row.name}" no se pudo guardar.`);
        nextRows.push(row);
      } catch {
        // Fallo de red real (ej. el gap de CORS intermitente de
        // playwright/README.md — confirmado en vivo 2026-09-02, esta misma
        // request cayó acá) — sin este catch marcando failedSilently más
        // abajo, la fila simplemente desaparecía del flujo sin ningún aviso:
        // ni toast, ni fila visible para reintentar. Bug real introducido
        // al reescribir esta función para el flujo de duplicados — el
        // código original si lo cubría (ver failedSilently más abajo).
        failedSilently++;
        nextRows.push(row);
      }
    }

    setRows(nextRows);
    setSaving(false);
    if (savedCount > 0) {
      toast.success(`${savedCount} métrica${savedCount === 1 ? "" : "s"} agregada${savedCount === 1 ? "" : "s"}`);
      onSaved();
    }
    for (const msg of rowErrorMessages) toast.error(msg);
    if (failedSilently > 0) {
      toast.error(`${failedSilently} métrica${failedSilently === 1 ? "" : "s"} no se pudo guardar por un error de red — probá de nuevo.`);
    }
    if (pendingDuplicateCount > 0) {
      // El paso queda abierto a propósito: hay decisiones reales pendientes
      // (combinar o crear igual), cerrar acá las escondería.
      toast.error(
        `${pendingDuplicateCount} sugerencia${pendingDuplicateCount === 1 ? "" : "s"} ya ${
          pendingDuplicateCount === 1 ? "existe" : "existen"
        } — revisá abajo antes de continuar.`
      );
      return;
    }
    onDone();
  };

  // Suma la query de esta sugerencia a la de la métrica ya existente
  // (arithmetic "+", ver querySpec.ts) en vez de crear una métrica nueva en
  // conflicto — solo tiene sentido cuando el destino es calculada (tiene una
  // query para extender); una métrica "input" (carga manual) no tiene query,
  // combinar ahí no significa nada — PERO si el destino es "input" (una
  // métrica default como "Revenue" cargada a mano, sin query todavía),
  // conectar sí significa algo: convertirla a calculada usando la query
  // sugerida tal cual, sin mezclar nada (no había query previo que
  // mezclar). Mismo cambio que hace el botón "Cambiar a Calculada y elegir
  // la fuente" de MetricPropertyPanel.tsx, pero disparado desde acá con la
  // fuente ya elegida por la IA en vez de que el usuario la elija a mano
  // después — encontrado en vivo 2026-09-02: sin esto, conectar una hoja
  // nueva nunca tocaba las métricas default existentes ("Revenue" seguía
  // vacía) aunque la IA hubiera reconocido el campo correcto.
  const handleCombine = async (i: number) => {
    const row = rows[i];
    const target = row.possibleDuplicate;
    if (!companyId || !target) return;
    const isConnectingInput = target.metric_type === "input";
    const isMergingCalculated = target.metric_type === "calculated" && !!target.query;
    if (!isConnectingInput && !isMergingCalculated) return;
    setRow(i, { combining: true });
    const query = isConnectingInput ? row.query : wrapInArithmetic("+", target.query!, row.query);
    const body: Record<string, unknown> = {
      company_id: companyId,
      metric_id: target.id,
      name: target.name,
      category: target.category,
      metric_type: "calculated",
      unit: target.unit ?? null,
      display_order: target.order_index,
      value_type: target.value_type ?? "count",
      query,
    };
    if (target.description) body.description = target.description;
    if (target.why_it_matters) body.why_it_matters = target.why_it_matters;
    const verb = isConnectingInput ? "conectar" : "sumar a";
    try {
      const res = await fetch(UPSERT_FINANCIAL_METRIC_DEFINITION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        await handleMembershipError(res);
        setRow(i, { combining: false });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(typeof data?.error === "string" ? data.error : `No se pudo ${verb} "${target.name}".`);
        setRow(i, { combining: false });
        return;
      }
      toast.success(isConnectingInput ? `"${target.name}" conectada a esta fuente` : `Sumado a "${target.name}"`);
      onSaved();
      setRows((prev) => prev.filter((_, idx) => idx !== i));
    } catch {
      toast.error(`No se pudo ${verb} "${target.name}".`);
      setRow(i, { combining: false });
    }
  };

  return (
    <>
      {needingMoreData.length > 0 && (
        <Alert className="mb-4">
          <AlertTriangle size={16} aria-hidden="true" />
          <AlertDescription className="text-xs space-y-1">
            <p className="font-medium">La IA no pudo proponer estas métricas por falta de datos:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {needingMoreData.map((m, i) => (
                <li key={i}>
                  <span className="font-medium">{m.name}:</span> {m.missing_data_description}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {rows.length === 0 ? (
        <EmptyState bordered={false} icon={Sparkles} title="La IA no encontró métricas nuevas para proponer." />
      ) : (
        <div className="space-y-4">
          {rows.map((row, i) => (
            <div key={i} className="border border-border rounded-md p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={row.approved}
                  onCheckedChange={(c) => setRow(i, { approved: c === true })}
                  className="mt-2.5"
                  aria-label={`Aprobar métrica ${row.name}`}
                />
                <div className="flex-1 min-w-0">
                  <Input
                    value={row.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    aria-label="Nombre de la métrica"
                    className="font-medium"
                  />
                  {row.possibleDuplicate && (
                    <div className="mt-1.5 space-y-1.5">
                      <p className="text-xs text-warning flex items-center gap-1">
                        <AlertTriangle size={11} strokeWidth={1.5} />
                        {row.duplicateFromServer
                          ? `Ya existe "${row.possibleDuplicate.name}" — no se creó de nuevo.`
                          : `Parecida a "${row.possibleDuplicate.name}" — revisá antes de crear otra.`}
                      </p>
                      {(row.possibleDuplicate.metric_type === "input" ||
                        (row.possibleDuplicate.metric_type === "calculated" && row.possibleDuplicate.query)) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={row.combining}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCombine(i);
                          }}
                        >
                          <Combine size={12} className="mr-1.5" aria-hidden="true" />
                          {row.combining
                            ? "Conectando…"
                            : row.possibleDuplicate.metric_type === "input"
                              ? `Usar esta fuente para "${row.possibleDuplicate.name}"`
                              : `Sumar esta fuente a "${row.possibleDuplicate.name}"`}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </label>

              {row.approved && (
                <div className="pl-7 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Categoría (tab donde aparece)">
                      <Input
                        value={row.category}
                        onChange={(e) => setRow(i, { category: e.target.value })}
                        list={`suggested-metric-category-${i}`}
                        placeholder="Ej: revenue, cash_efficiency"
                      />
                      <datalist id={`suggested-metric-category-${i}`}>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id} />
                        ))}
                      </datalist>
                    </FormField>
                    <FormField label="Unidad">
                      <Input
                        value={row.unit}
                        onChange={(e) => setRow(i, { unit: e.target.value })}
                        placeholder="USD, %, x, meses…"
                      />
                    </FormField>
                  </div>
                  <FormField label="Qué es">
                    <Textarea
                      value={row.description}
                      onChange={(e) => setRow(i, { description: e.target.value })}
                      rows={2}
                    />
                  </FormField>
                  {row.why_it_matters && (
                    <FormField label="Por qué importa">
                      <Textarea
                        value={row.why_it_matters}
                        onChange={(e) => setRow(i, { why_it_matters: e.target.value })}
                        rows={2}
                      />
                    </FormField>
                  )}
                  <div>
                    <p className="text-xs font-medium text-foreground mb-1.5">Consulta</p>
                    <div className="rounded-md bg-surface border border-border p-2.5">
                      <QuerySummary query={row.query} className="text-xs" />
                    </div>
                    <p className="text-[11px] text-tertiary mt-1">
                      Se puede ajustar después desde "Editar métrica" con el query builder completo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <FormActions
        className="mt-4"
        onCancel={onDone}
        cancelLabel="Omitir por ahora"
        onSubmit={handleConfirm}
        submitLabel={approvedCount > 0 ? `Agregar ${approvedCount} métrica${approvedCount === 1 ? "" : "s"}` : "Agregar"}
        busy={saving}
      />
    </>
  );
}
