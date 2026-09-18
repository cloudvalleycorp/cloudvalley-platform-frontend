import { describe, it, expect } from "vitest";
import {
  autoMapHeaders,
  periodColumnLooksWrong,
  normalizeConceptValueType,
  findDuplicateHeaders,
  rowKey,
} from "@/pages/GrowthTrackerSheets";
import {
  HEADERS_TRANSACTION_LEDGER,
  HEADERS_TIME_SERIES,
  HEADERS_FINANCIAL_MODEL_WIDE,
  SAMPLE_ROWS_FINANCIAL_MODEL_WIDE,
  SAMPLE_ROWS_TRANSACTION_LEDGER,
  HEADERS_EAV_METRICS,
  HEADERS_TRANSACTION_LEDGER_ARS,
  SAMPLE_ROWS_TRANSACTION_LEDGER_ARS,
} from "@/test/fixtures/metrics";

describe("autoMapHeaders", () => {
  it("detecta la columna de período por nombre en un libro de transacciones real", () => {
    const { periodColumn } = autoMapHeaders(HEADERS_TRANSACTION_LEDGER);
    expect(periodColumn).toBe("Fecha");
  });

  it("detecta la columna de período en un time_series ('Mes')", () => {
    const { periodColumn } = autoMapHeaders(HEADERS_TIME_SERIES);
    expect(periodColumn).toBe("Mes");
  });

  it("NO detecta ninguna columna de período en un estado de resultados ancho (confirma el gap real)", () => {
    const { periodColumn } = autoMapHeaders(HEADERS_FINANCIAL_MODEL_WIDE);
    expect(periodColumn).toBeNull();
  });

  it("mapea el resto de las columnas a field_keys en snake_case, sin duplicar el de período", () => {
    const { periodColumn, fieldMappings } = autoMapHeaders(HEADERS_TRANSACTION_LEDGER);
    expect(fieldMappings[periodColumn!]).toBeUndefined();
    expect(Object.keys(fieldMappings)).toHaveLength(HEADERS_TRANSACTION_LEDGER.length - 1);
    expect(fieldMappings["Cliente"].field_key).toBe("cliente");
  });

  it("headers duplicados (mismo nombre dos veces) generan field_keys distintos con sufijo", () => {
    const { fieldMappings } = autoMapHeaders(["Fecha", "Monto", "Monto"]);
    const keys = Object.values(fieldMappings).map((m) => m.field_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("headers vacíos no rompe, devuelve mapeos vacíos", () => {
    expect(autoMapHeaders([])).toEqual({ periodColumn: null, periodColumnIndex: null, fieldMappings: {} });
  });

  it("detecta la columna de período en un layout eav ('Fecha') aunque el resto lo procese extract-sheet-layout, no este mapeo", () => {
    const { periodColumn } = autoMapHeaders(HEADERS_EAV_METRICS);
    expect(periodColumn).toBe("Fecha");
  });

  it("contrato 2026-09-05: columnas con nombre repetido quedan como entradas separadas (rowKey), no se colapsan en una sola", () => {
    const { fieldMappings } = autoMapHeaders(["Fecha", "Monto", "Monto"]);
    expect(Object.keys(fieldMappings)).toHaveLength(2);
    const entries = Object.values(fieldMappings);
    expect(entries.every((m) => m.column === "Monto")).toBe(true);
    // Cada entrada de un nombre duplicado trae column_index (la posición
    // real) para que save-sheet-mapping pueda distinguirlas — antes de este
    // contrato, la segunda columna pisaba a la primera en silencio (ver
    // findDuplicateHeaders más abajo).
    const indices = entries.map((m) => m.column_index).sort();
    expect(indices).toEqual([1, 2]);
  });

  it("una columna sin nombre repetido nunca lleva column_index (sigue funcionando igual que antes del contrato 2026-09-05)", () => {
    const { fieldMappings } = autoMapHeaders(["Fecha", "Monto"]);
    expect(fieldMappings["Monto"].column_index).toBeUndefined();
  });
});

describe("rowKey", () => {
  it("un nombre único usa el nombre tal cual como key, sin sufijo de posición", () => {
    expect(rowKey("Monto", 3, [])).toBe("Monto");
  });

  it("un nombre repetido usa nombre+posición, así dos columnas de igual nombre no colisionan en el mismo key", () => {
    expect(rowKey("Monto", 1, ["Monto"])).toBe("Monto#1");
    expect(rowKey("Monto", 2, ["Monto"])).toBe("Monto#2");
    expect(rowKey("Monto", 1, ["Monto"])).not.toBe(rowKey("Monto", 2, ["Monto"]));
  });
});

describe("periodColumnLooksWrong", () => {
  it("sin columna elegida (null) nunca marca error", () => {
    expect(periodColumnLooksWrong(null, HEADERS_TRANSACTION_LEDGER, SAMPLE_ROWS_TRANSACTION_LEDGER)).toBe(false);
  });

  it("una columna real de fechas (caso feliz) no se marca como sospechosa", () => {
    expect(periodColumnLooksWrong("Fecha", HEADERS_TRANSACTION_LEDGER, SAMPLE_ROWS_TRANSACTION_LEDGER)).toBe(false);
  });

  it("una columna de texto/etiquetas (el bug real: elegir 'EERR 2026' como período) se marca como sospechosa", () => {
    expect(periodColumnLooksWrong("EERR 2026", HEADERS_FINANCIAL_MODEL_WIDE, SAMPLE_ROWS_FINANCIAL_MODEL_WIDE)).toBe(true);
  });

  it("una columna de números que no son fechas (ej. 'Enero' con montos) también se marca como sospechosa", () => {
    expect(periodColumnLooksWrong("Enero", HEADERS_FINANCIAL_MODEL_WIDE, SAMPLE_ROWS_FINANCIAL_MODEL_WIDE)).toBe(true);
  });

  it("una columna con todos los valores vacíos no rompe (no hay evidencia ni para bien ni para mal)", () => {
    expect(periodColumnLooksWrong("Vacía", ["Vacía"], [[""], [""], [""]])).toBe(false);
  });

  it("un header que no existe en absoluto no rompe", () => {
    expect(periodColumnLooksWrong("No Existe", HEADERS_TRANSACTION_LEDGER, SAMPLE_ROWS_TRANSACTION_LEDGER)).toBe(false);
  });

  // Gap real documentado (no corregido en esta pasada): Date.parse acepta
  // "01/07/2026" igual que una fecha MM/DD/YYYY válida (7 de enero), aunque
  // acá signifique 1 de julio (DD/MM/YYYY, formato real de una planilla
  // armada en Argentina) — la heurística solo mide "¿parsea como fecha?", no
  // valida el orden día/mes, así que NO detecta este caso como sospechoso
  // pese a interpretar mal cada fecha. Test documenta el comportamiento
  // actual a propósito, para que un cambio futuro que lo arregle lo note acá.
  it("una columna de fecha DD/MM/YYYY no se marca como sospechosa aunque Date.parse la interprete mal (gap conocido)", () => {
    expect(
      periodColumnLooksWrong("Fecha", HEADERS_TRANSACTION_LEDGER_ARS, SAMPLE_ROWS_TRANSACTION_LEDGER_ARS)
    ).toBe(false);
  });
});

describe("findDuplicateHeaders", () => {
  it("headers todos distintos no devuelve nada", () => {
    expect(findDuplicateHeaders(HEADERS_TRANSACTION_LEDGER)).toEqual([]);
  });

  it("el bug real encontrado en vivo 2026-09-01: 'Cliente' y 'Monto' repetidos se detectan los dos", () => {
    const result = findDuplicateHeaders(["Fecha", "Cliente", "Monto", "Cliente", "Monto"]);
    expect(result).toEqual(["Cliente", "Monto"]);
  });

  it("un header repetido 3 veces aparece una sola vez en el resultado, no tres", () => {
    expect(findDuplicateHeaders(["Monto", "Monto", "Monto"])).toEqual(["Monto"]);
  });

  it("headers vacíos no rompe", () => {
    expect(findDuplicateHeaders([])).toEqual([]);
  });
});

describe("normalizeConceptValueType", () => {
  it("deja pasar los 2 valores que extract-sheet-layout garantiza desde el contrato 2026-09-01", () => {
    expect(normalizeConceptValueType("number")).toBe("number");
    expect(normalizeConceptValueType("text")).toBe("text");
  });

  it("red de seguridad: 'monetary'/'currency' (vistos en vivo antes de la garantía del contrato) caen a 'number', no a 'text'", () => {
    expect(normalizeConceptValueType("monetary")).toBe("number");
    expect(normalizeConceptValueType("currency")).toBe("number");
  });

  it("un valor totalmente desconocido cae a 'text' en vez de asumir que es plata", () => {
    expect(normalizeConceptValueType("percentage")).toBe("text");
  });
});
