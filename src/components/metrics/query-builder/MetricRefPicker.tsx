import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

export type MetricOption = { id: string; name: string; unit: string | null };

type Props = {
  value: string;
  onChange: (metricId: string) => void;
  metricOptions: MetricOption[];
};

export function MetricRefPicker({ value, onChange, metricOptions }: Props) {
  const [open, setOpen] = useState(false);
  const selected = metricOptions.find((m) => m.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 flex-1 min-w-0 justify-between font-normal text-xs">
          <span className="truncate">{selected ? selected.name : "Elegí una métrica…"}</span>
          <ChevronsUpDown size={12} className="opacity-50 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar métrica…" />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {metricOptions.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.name} ${m.id}`}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate">{m.name}</span>
                  {m.unit && <span className="text-[10px] text-tertiary shrink-0">{m.unit}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
