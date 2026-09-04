import { useEffect, useState } from "react";
import { type RawField } from "@/lib/metrics";
import { LIST_RAW_FIELDS_URL, LIST_SHEET_CONNECTIONS_URL, LIST_GOOGLE_ACCOUNTS_URL, type SheetConnection, type GoogleAccount } from "@/lib/sheetsIntegration";
import { handleMembershipError } from "@/lib/membership";

/**
 * Extraído de Metrics.tsx (reloadSources) para reusar el mismo trío
 * cuentas/conexiones/campos crudos desde el Dashboard (Data Readiness) sin
 * duplicar la lógica de Promise.allSettled — ver comentario original sobre
 * por qué no es Promise.all (un solo fallo de red, ej. el CORS conocido de
 * list-raw-fields, no debe tirar las otras dos respuestas ya resueltas).
 */
export function useSheetsSources(companyId: string | null) {
  const [rawFields, setRawFields] = useState<RawField[]>([]);
  const [connections, setConnections] = useState<SheetConnection[]>([]);
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    const qs = `?company_id=${encodeURIComponent(companyId)}`;
    const [fieldsResult, connectionsResult, accountsResult] = await Promise.allSettled([
      fetch(`${LIST_RAW_FIELDS_URL}${qs}`, { credentials: "include" }),
      fetch(`${LIST_SHEET_CONNECTIONS_URL}${qs}`, { credentials: "include" }),
      fetch(`${LIST_GOOGLE_ACCOUNTS_URL}${qs}`, { credentials: "include" }),
    ]);

    const connectionLabelById: Record<string, string> = {};
    let conns: SheetConnection[] = [];
    if (connectionsResult.status === "fulfilled" && connectionsResult.value.ok) {
      try {
        const connectionsData = await connectionsResult.value.json();
        conns = Array.isArray(connectionsData?.connections) ? connectionsData.connections : [];
        for (const c of conns) connectionLabelById[c.connection_id] = `${c.spreadsheet_name} · ${c.sheet_name}`;
      } catch {
        // sigue con conns vacío
      }
    }
    setConnections(conns);

    if (fieldsResult.status === "fulfilled") {
      const fieldsRes = fieldsResult.value;
      if (fieldsRes.ok) {
        try {
          const fieldsData = await fieldsRes.json();
          const fields: Omit<RawField, "connection_label">[] = Array.isArray(fieldsData?.fields) ? fieldsData.fields : [];
          setRawFields(fields.map((f) => ({ ...f, connection_label: connectionLabelById[f.connection_id] ?? null })));
        } catch {
          setRawFields([]);
        }
      } else {
        await handleMembershipError(fieldsRes);
        setRawFields([]);
      }
    } else {
      // Fallo de red (ej. CORS) — silencioso, mismo criterio que antes:
      // las pantallas que dependen de esto simplemente muestran menos señales.
      setRawFields([]);
    }

    if (accountsResult.status === "fulfilled" && accountsResult.value.ok) {
      try {
        const accountsData = await accountsResult.value.json();
        setAccounts(Array.isArray(accountsData?.accounts) ? accountsData.accounts : []);
      } catch {
        setAccounts([]);
      }
    } else {
      setAccounts([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  return { rawFields, connections, accounts, loading, reload };
}
