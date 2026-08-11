import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import type { RawField } from "@/lib/metrics";

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
  const selectedTitle = selected
    ? [selected.connection_label, selected.description].filter(Boolean).join(" — ") || undefined
    : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 flex-1 min-w-0 justify-between font-normal text-xs"
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
  );
}
