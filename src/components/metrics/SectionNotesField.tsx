import { useState } from "react";
import { Button } from "@/components/ui/button";

// Nota de una sección del reporte. Se cierra hasta que se necesita: "+ Agregar nota".
// Texto plano, máximo 500 caracteres. Vacío se guarda como null. El contador es del
// editor; en el PDF no aparece.
export const SECTION_NOTE_MAX = 500;

type Props = {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
};

export function SectionNotesField({ id, value, onChange }: Props) {
  const [open, setOpen] = useState(value != null && value !== "");

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="self-start text-primary-dark" aria-controls={id} aria-expanded={false} onClick={() => setOpen(true)}>
        + Agregar nota
      </Button>
    );
  }

  const text = value ?? "";
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Nota de la sección
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={SECTION_NOTE_MAX}
        value={text}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="w-full min-h-[88px] rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Texto plano. Se muestra en el PDF y en la versión publicada.</span>
        <div className="flex items-center gap-3">
          <span className="tabular-nums">
            {text.length} / {SECTION_NOTE_MAX}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Quitar nota
          </Button>
        </div>
      </div>
    </div>
  );
}
