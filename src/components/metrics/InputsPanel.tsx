import { useState } from "react";
import { Link } from "react-router-dom";
import { Info, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
import { formatValueByType, sourceLabel, sourceSettingsPath, type MetricDef, type InputsMap } from "@/lib/metrics";

type Props = {
  inputs: MetricDef[];
  values: InputsMap;
  onSave: (inputKey: string, value: number | null) => Promise<void>;
  onInfo: (m: MetricDef) => void;
  privacy?: Record<string, boolean>;
  onTogglePrivacy?: (metricId: string, next: boolean) => Promise<void>;
};

export function InputsPanel({ inputs, values, onSave, onInfo, privacy, onTogglePrivacy }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (key: string, current: number | undefined) => {
    setEditing(key);
    setDraft(current?.toString() ?? "");
  };

  const commit = async (key: string, valueType: MetricDef["value_type"]) => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      await onSave(key, null);
    } else {
      let num = Number(trimmed);
      if (!isNaN(num)) {
        if (valueType === "count") num = Math.round(num);
        await onSave(key, num);
      }
    }
    setEditing(null);
  };

  return (
    <section className="border border-border rounded-lg bg-card overflow-hidden">
      <header className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-medium">Datos del mes</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cargá los datos crudos. Las métricas calculadas se actualizan automáticamente.
        </p>
      </header>
      <div className="divide-y divide-border">
        {inputs.map((m) => {
          const key = m.input_key!;
          const current = values[key];
          const isEditing = editing === key;
          const syncedFrom = sourceLabel(m.source);
          const settingsPath = sourceSettingsPath(m.source, m.source_connection_id);
          return (
            <div
              key={m.id}
              className="flex items-center justify-between px-5 py-3 hover:bg-surface/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {onTogglePrivacy && (
                  <PrivacyToggle
                    isPublic={privacy?.[m.id] ?? true}
                    onChange={(next) => onTogglePrivacy(m.id, next)}
                  />
                )}
                <span className="text-sm">{m.name}</span>
                {m.unit && (
                  <span className="text-xs text-muted-foreground">({m.unit})</span>
                )}
                {syncedFrom ? (
                  settingsPath ? (
                    <Link
                      to={settingsPath}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground border border-border rounded-full px-2 py-0.5 hover:text-foreground hover:border-foreground/30 transition-colors"
                      title={`Se sincroniza desde ${syncedFrom}. Click para ir a la conexión.`}
                    >
                      <Zap size={10} strokeWidth={2} />
                      {syncedFrom}
                    </Link>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground border border-border rounded-full px-2 py-0.5"
                      title={`Se sincroniza desde ${syncedFrom}.`}
                    >
                      <Zap size={10} strokeWidth={2} />
                      {syncedFrom}
                    </span>
                  )
                ) : (
                  // Mismo criterio que AnnualGrid.tsx: acceso directo para
                  // conectar este input a una fuente ya conectada, en vez de
                  // solo el ícono de info genérico.
                  <button
                    type="button"
                    onClick={() => onInfo(m)}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground border border-dashed border-border rounded-full px-2 py-0.5 hover:text-primary hover:border-primary/50 transition-colors"
                    title="Este dato se carga a mano — conectalo a una fuente si ya la tenés."
                  >
                    <Zap size={10} strokeWidth={2} />
                    Conectar fuente
                  </button>
                )}
                <button
                  onClick={() => onInfo(m)}
                  className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Info sobre ${m.name}`}
                >
                  <Info size={14} strokeWidth={1.5} />
                </button>
              </div>
              <div className="w-40">
                {syncedFrom ? (
                  <div className="w-full text-right text-sm font-medium px-3 py-1.5">
                    {current !== undefined ? formatValueByType(current, m.value_type) : "—"}
                  </div>
                ) : isEditing ? (
                  <div className="relative">
                    {m.value_type === "money" && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                        $
                      </span>
                    )}
                    <Input
                      autoFocus
                      type="number"
                      step={m.value_type === "count" ? 1 : "any"}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commit(key, m.value_type)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commit(key, m.value_type);
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className={cn(
                        "h-8 text-sm text-right",
                        m.value_type === "money" && "pl-6",
                        m.value_type === "percentage" && "pr-6"
                      )}
                      placeholder="0"
                      aria-label={m.name}
                    />
                    {m.value_type === "percentage" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                        %
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(key, current)}
                    className={cn(
                      "w-full text-right text-sm font-medium px-3 py-1.5 rounded-md hover:bg-surface transition-colors",
                      current === undefined && "text-muted-foreground"
                    )}
                  >
                    {current !== undefined ? formatValueByType(current, m.value_type) : "—"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}