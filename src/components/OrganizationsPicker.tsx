import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type OrgSelection = {
  organization_id: string;
  batch?: string;
  year?: number | null;
};

type Org = { id: string; name: string; type: string };

type Props = {
  value: OrgSelection[];
  onChange: (next: OrgSelection[]) => void;
  noneSelected?: boolean;
  onNoneSelectedChange?: (val: boolean) => void;
};

const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 2018 + 1 }, (_, i) => currentYear - i);

export function OrganizationsPicker({
  value,
  onChange,
  noneSelected = false,
  onNoneSelectedChange,
}: Props) {
  const [orgs, setOrgs] = useState<Org[]>([]);

  useEffect(() => {
    supabase
      .from("organizations")
      .select("id, name, type")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setOrgs((data as Org[]) ?? []));
  }, []);

  const toggle = (orgId: string) => {
    if (noneSelected) onNoneSelectedChange?.(false);
    const exists = value.find((v) => v.organization_id === orgId);
    if (exists) {
      onChange(value.filter((v) => v.organization_id !== orgId));
    } else {
      onChange([...value, { organization_id: orgId, batch: "", year: currentYear }]);
    }
  };

  const update = (orgId: string, patch: Partial<OrgSelection>) => {
    onChange(value.map((v) => (v.organization_id === orgId ? { ...v, ...patch } : v)));
  };

  return (
    <div className="space-y-3">
      {orgs.map((org) => {
        const selection = value.find((v) => v.organization_id === org.id);
        const isSelected = !!selection;
        return (
          <div
            key={org.id}
            className={cn(
              "rounded-lg border transition-all duration-150",
              isSelected ? "border-foreground bg-surface" : "border-border hover:border-foreground/30"
            )}
          >
            <button
              type="button"
              onClick={() => toggle(org.id)}
              className="w-full flex items-center gap-3 p-4 text-left"
            >
              <Checkbox checked={isSelected} className="pointer-events-none" />
              <div className="flex-1">
                <div className="font-medium">{org.name}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {org.type === "both" ? "Fondo y aceleradora" : org.type === "fund" ? "Fondo" : "Aceleradora"}
                </div>
              </div>
            </button>
            {isSelected && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                  <Label className="text-xs">Batch (opcional)</Label>
                  <Input
                    placeholder="ej: Batch 3"
                    value={selection?.batch ?? ""}
                    onChange={(e) => update(org.id, { batch: e.target.value })}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Año</Label>
                  <select
                    value={selection?.year ?? ""}
                    onChange={(e) =>
                      update(org.id, { year: e.target.value ? Number(e.target.value) : null })
                    }
                    className="h-9 mt-1 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">—</option>
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {onNoneSelectedChange && (
        <button
          type="button"
          onClick={() => {
            onNoneSelectedChange(!noneSelected);
            if (!noneSelected) onChange([]);
          }}
          className={cn(
            "w-full text-left p-3 rounded-lg border text-sm transition-all duration-150",
            noneSelected ? "border-foreground bg-surface" : "border-border hover:border-foreground/30 text-muted-foreground"
          )}
        >
          No pertenezco a ninguna
        </button>
      )}
    </div>
  );
}
