// CAPA: Entity Resolution (Metrics AI-native, 2026-08-30) — agrupar valores
// distintos que representan la misma entidad real ("Acme"/"Acme Inc."/"ACME
// Corp" → un solo customer) y clasificar el tipo económico de una
// transacción (revenue/expense/transfer/refund/financing/other). Separado de
// sheetsIntegration.ts porque opera sobre datos YA ingeridos de una conexión
// (cualquier source), no sobre el mapeo de columnas en sí.
import { API_BASE_URL } from "@/lib/apiConfig";
import type { Confidence } from "@/lib/financialData";

export const RESOLVE_ENTITIES_URL = `${API_BASE_URL}/resolve-entities`;
export const LIST_ENTITY_ALIASES_URL = `${API_BASE_URL}/list-entity-aliases`;
export const UPDATE_ENTITY_ALIAS_URL = `${API_BASE_URL}/update-entity-alias`;
export const DELETE_ENTITY_ALIAS_URL = `${API_BASE_URL}/delete-entity-alias`;

export type EntityType = "customer" | "vendor" | "account";
export type TransactionType = "revenue" | "expense" | "transfer" | "refund" | "financing" | "other";

// resolve-entities, modo propuesta ("confirm" ausente/false) — el score/basis
// viene tal cual del modelo, SIN "method" (a diferencia del resto de los
// Confidence de este dominio).
export type EntityProposalConfidence = Pick<Confidence, "score" | "basis">;

export type EntityCluster = { canonical_name: string; aliases: string[]; confidence?: EntityProposalConfidence };
export type TransactionTypeMappingRow = { raw_value: string; transaction_type: TransactionType; confidence?: EntityProposalConfidence };

export type ResolveEntitiesProposalResponse =
  | { clusters: EntityCluster[]; mapping?: never }
  | { mapping: TransactionTypeMappingRow[]; clusters?: never };

export type ResolveEntitiesConfirmEntityResponse = {
  connection_id: string;
  entity_columns: { field_key: string; entity_type: EntityType }[];
};

export type ResolveEntitiesConfirmTransactionTypeResponse = {
  connection_id: string;
  transaction_type_column: string;
  transaction_type_mapping: Record<string, TransactionType>;
};

export type CanonicalEntity = { canonical_entity_id: string; entity_type: EntityType; display_name: string; aliases: string[] };

export type ListEntityAliasesResponse = { entities: CanonicalEntity[] };
