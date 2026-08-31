import { useMemo, useState } from "react";
import { ChevronsUpDown, Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import type { RawField } from "@/lib/metrics";
import { normalize } from "@/lib/metricSimilarity";

type Props = {
  value: string | null;
  onChange: (fieldKey: string) => void;
  rawFields: RawField[];
  placeholder?: string;
};

// Combobox buscable sobre los campos crudos de una integración — mismo
// patrón que HeaderCombobox (GrowthTrackerSheets.tsx) y el picker de
// "Insertar variable" del viejo FormulaField.tsx: Popover+Command, muestra
// el nombre de columna original (sample_column) como label, el field_key
// normalizado como referencia chica al costado.
//
// connection_label (planilla · hoja) se muestra siempre que existe, tanto
// en la opción como en el valor ya elegido — dos conexiones distintas
// pueden tener una columna con el mismo nombre visible ("Monto") mapeada a
// datos completamente distintos, así que el nombre de columna solo no
// alcanza para saber "de qué Monto estamos hablando".
export function RawFieldPicker({ value, onChange, rawFields, placeholder = "Elegí un campo…" }: Props) {
  const [open, setOpen] = useState(false);
  const selected = rawFields.find((f) => f.field_key === value);

  // Multi-fuente: si "Revenue" está partido en 2 planillas, sumarlas hoy
  // requiere armar la aritmética a mano en el query builder ("Combinar
  // con…") — este hint solo lo hace descubrible, comparando nombres de
  // columna con un heurístico determinístico (no semántico: no detecta
  // "Sales"/"Ingresos" como lo mismo que "Revenue", solo variantes de
  // formato/substring). Nunca combina nada solo.
  const similarInOtherSources = useMemo(() => {
    if (!selected) return [];
    const norm = normalize(selected.sample_column);
    if (!norm) return [];
    return rawFields.filter(
      (f) =>
        f.connection_id !== selected.connection_id &&
        f.field_key !== selected.field_key &&
        (normalize(f.sample_column) === norm || normalize(f.sample_column).includes(norm) || norm.includes(normalize(f.sample_column)))
    );
  }, [selected, rawFields]);

  const selectedTitle = selected
    ? [selected.connection_label, selected.description].filter(Boolean).join(": ") || undefined
    : undefined;
  return (
    <div className="flex-1 min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full justify-between font-normal text-xs"
            title={selectedTitle}
          >
            <span className="truncate">
              {selected ? selected.sample_column : placeholder}
              {selected?.connection_label && (
                <span className="text-tertiary"> · {selected.connection_label}</span>
              )}
            </span>
            <ChevronsUpDown size={12} className="opacity-50 shrink-0" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar campo…" />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                {rawFields.map((f) => (
                  <CommandItem
                    key={`${f.connection_id}:${f.field_key}`}
                    value={`${f.sample_column} ${f.field_key} ${f.connection_label ?? ""}`}
                    onSelect={() => {
                      onChange(f.field_key);
                      setOpen(false);
                    }}
                    className="flex flex-col items-start gap-0.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-3 w-full">
                      <span className="truncate">{f.sample_column}</span>
                      <span className="text-[10px] font-mono text-tertiary shrink-0">{f.field_key}</span>
                    </div>
                    {f.connection_label && (
                      <span className="text-[11px] text-muted-foreground truncate w-full">{f.connection_label}</span>
                    )}
                    {f.description && (
                      <span className="text-[11px] text-tertiary truncate w-full">{f.description}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {similarInOtherSources.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
          <Sigma size={11} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          Campo{similarInOtherSources.length === 1 ? "" : "s"} con nombre parecido en otra fuente:{" "}
          {similarInOtherSources.map((f) => f.connection_label ?? f.field_key).join(", ")}. Se pueden sumar con
          "Combinar con…".
        </p>
      )}
    </div>
  );
}
