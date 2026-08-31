import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PropertyFieldType = "text" | "textarea" | "select" | "checkbox";

export type PropertyFieldDef = {
  key: string;
  label: string;
  type: PropertyFieldType;
  options?: { value: string; label: string }[]; // for "select"
  placeholder?: string;
  helpText?: string;
  datalistOptions?: string[]; // for "text", an optional <datalist> of suggestions
};

// Metadata-driven field renderer: General/Tipo/Configuración describe their
// fields as PropertyFieldDef[] (data), not one hand-written block of JSX per
// field — adding a property later (once backend supports it) is adding an
// entry to that array, not touching this switch. "Fuente de datos" and
// "Fórmula" don't go through here (see MetricPropertyPanel) — they aren't
// simple key/value fields, one is a derived read-only status+link, the other
// is the standalone FormulaField component.
export function PropertyField({
  field,
  value,
  onChange,
  readOnly = false,
}: {
  field: PropertyFieldDef;
  value: string | boolean;
  onChange: (key: string, value: string | boolean) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    if (field.type === "checkbox") {
      return (
        <FormField label={field.label}>
          <p className="text-sm">{value ? "Sí" : "No"}</p>
        </FormField>
      );
    }
    const display =
      field.type === "select"
        ? (field.options?.find((o) => o.value === value)?.label ?? String(value || "—"))
        : String(value || "—");
    return (
      <FormField label={field.label}>
        <p className="text-sm">{display}</p>
      </FormField>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={value === true}
          onCheckedChange={(c) => onChange(field.key, c === true)}
          className="mt-0.5"
        />
        <span>
          {field.label}
          {field.helpText && <span className="block text-xs text-muted-foreground">{field.helpText}</span>}
        </span>
      </label>
    );
  }

  if (field.type === "select") {
    // Radix <Select.Item> no admite value="" (tira en runtime) — un option
    // con value:"" (ej. "Sin asignar") se mapea a un sentinel interno acá,
    // sin que el resto del código (Draft, handleSave, etc.) tenga que saber
    // de esto: onChange siempre recibe "" de vuelta, nunca el sentinel.
    const EMPTY_SENTINEL = "__unassigned__";
    return (
      <FormField label={field.label} helpText={field.helpText}>
        <Select
          value={value === "" ? EMPTY_SENTINEL : (value as string)}
          onValueChange={(v) => onChange(field.key, v === EMPTY_SENTINEL ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => (
              <SelectItem key={o.value} value={o.value === "" ? EMPTY_SENTINEL : o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    );
  }

  if (field.type === "textarea") {
    return (
      <FormField label={field.label} helpText={field.helpText}>
        <Textarea
          value={value as string}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={2}
        />
      </FormField>
    );
  }

  const datalistId = field.datalistOptions ? `property-field-${field.key}` : undefined;
  return (
    <FormField label={field.label} helpText={field.helpText}>
      <Input
        value={value as string}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        list={datalistId}
      />
      {field.datalistOptions && (
        <datalist id={datalistId}>
          {field.datalistOptions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </FormField>
  );
}
