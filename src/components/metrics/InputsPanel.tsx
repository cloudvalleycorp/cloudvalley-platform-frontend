import { useState } from "react";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
import type { MetricDef, InputsMap } from "@/lib/metrics";

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

  const commit = async (key: string) => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      await onSave(key, null);
    } else {
      const num = Number(trimmed);
      if (!isNaN(num)) await onSave(key, num);
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
                <button
                  onClick={() => onInfo(m)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Info sobre ${m.name}`}
                >
                  <Info size={13} strokeWidth={1.5} />
                </button>
              </div>
              <div className="w-40">
                {isEditing ? (
                  <Input
                    autoFocus
                    type="number"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commit(key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit(key);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-8 text-sm text-right"
                    placeholder="0"
                  />
                ) : (
                  <button
                    onClick={() => startEdit(key, current)}
                    className={cn(
                      "w-full text-right text-sm font-medium px-3 py-1.5 rounded-md hover:bg-surface transition-colors",
                      current === undefined && "text-muted-foreground"
                    )}
                  >
                    {current !== undefined ? current.toLocaleString() : "—"}
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