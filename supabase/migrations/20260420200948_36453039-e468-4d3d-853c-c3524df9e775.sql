-- 1. Add new columns to metric_definitions
ALTER TABLE public.metric_definitions
  ADD COLUMN IF NOT EXISTS metric_type text NOT NULL DEFAULT 'calculated',
  ADD COLUMN IF NOT EXISTS input_key text,
  ADD COLUMN IF NOT EXISTS formula_expression text,
  ADD COLUMN IF NOT EXISTS unit text;

ALTER TABLE public.metric_definitions
  ADD CONSTRAINT metric_type_check CHECK (metric_type IN ('input', 'calculated'));

CREATE UNIQUE INDEX IF NOT EXISTS metric_definitions_input_key_unique
  ON public.metric_definitions (input_key) WHERE input_key IS NOT NULL;

-- 2. Wipe existing metric data (we are reseeding — early stage, no real data yet)
DELETE FROM public.metric_entries;
DELETE FROM public.metric_configs;
DELETE FROM public.metric_definitions;

-- 3. Seed INPUTS (raw data the founder enters monthly)
INSERT INTO public.metric_definitions (name, category, metric_type, input_key, unit, description, why_it_matters, order_index, is_core, applies_to_model) VALUES
  ('Revenue', 'revenue', 'input', 'revenue', 'USD', 'Ingresos totales del mes (cobrados, no facturados).', 'Es la métrica madre: todo se deriva de cuánta plata entra.', 1, true, ARRAY['saas','marketplace','ecommerce','b2b_services','consumer','other']::business_model[]),
  ('Nuevo MRR', 'revenue', 'input', 'new_mrr', 'USD', 'MRR de clientes nuevos este mes.', 'Indica velocidad de crecimiento del topline recurrente.', 2, true, ARRAY['saas']::business_model[]),
  ('MRR Perdido (Churn)', 'revenue', 'input', 'churned_mrr', 'USD', 'MRR perdido por cancelaciones este mes.', 'Cuantifica leaky bucket: cuánto crecimiento te come el churn.', 3, true, ARRAY['saas']::business_model[]),
  ('Usuarios Activos', 'acquisition', 'input', 'active_users', 'usuarios', 'Usuarios activos al cierre del mes.', 'Base de la ecuación de monetización y retención.', 4, true, ARRAY['saas','marketplace','consumer']::business_model[]),
  ('Usuarios Nuevos', 'acquisition', 'input', 'new_users', 'usuarios', 'Usuarios adquiridos durante el mes.', 'Mide tracción de adquisición en valor absoluto.', 5, true, ARRAY['saas','marketplace','consumer']::business_model[]),
  ('Marketing Spend', 'acquisition', 'input', 'marketing_spend', 'USD', 'Gasto total en marketing y ventas para adquirir usuarios.', 'Sin esto no podés calcular CAC ni eficiencia de canal.', 6, true, ARRAY['saas','marketplace','ecommerce','b2b_services','consumer','other']::business_model[]),
  ('Cash en Banco', 'cash_efficiency', 'input', 'cash_balance', 'USD', 'Efectivo total disponible al cierre del mes.', 'Determina cuánto runway te queda antes de levantar.', 7, true, ARRAY['saas','marketplace','ecommerce','b2b_services','consumer','other']::business_model[]),
  ('Burn Mensual', 'cash_efficiency', 'input', 'monthly_burn', 'USD', 'Cash que quemás por mes (gastos - ingresos).', 'Junto con cash, define tu pista de aterrizaje.', 8, true, ARRAY['saas','marketplace','ecommerce','b2b_services','consumer','other']::business_model[]);

-- 4. Seed CALCULATED metrics
INSERT INTO public.metric_definitions (name, category, metric_type, formula_expression, unit, formula, description, why_it_matters, benchmark, order_index, is_core, applies_to_model) VALUES
  ('ARPU', 'revenue', 'calculated', 'revenue / active_users', 'USD', 'Revenue / Usuarios Activos', 'Average Revenue Per User: cuánto ingreso genera cada usuario en promedio.', 'Indica capacidad de monetización. Combinado con CAC dice si el modelo cierra.', 'SaaS B2B: $50-500/mes. Consumer: $1-20/mes.', 10, true, ARRAY['saas','marketplace','consumer']::business_model[]),
  ('CAC', 'acquisition', 'calculated', 'marketing_spend / new_users', 'USD', 'Marketing Spend / Usuarios Nuevos', 'Customer Acquisition Cost: cuánto cuesta traer un nuevo cliente.', 'Si CAC > LTV no hay negocio. Es la métrica que más miran inversores.', 'Idealmente recuperás CAC en menos de 12 meses.', 11, true, ARRAY['saas','marketplace','ecommerce','b2b_services','consumer']::business_model[]),
  ('LTV', 'revenue', 'calculated', '(revenue / active_users) / (churned_mrr / (revenue - churned_mrr + 0.0001))', 'USD', 'ARPU / Churn Rate', 'Lifetime Value: ingresos totales esperados de un cliente durante su vida.', 'Define cuánto podés gastar en adquirir clientes (CAC).', 'Buscá LTV/CAC > 3x.', 12, true, ARRAY['saas','marketplace']::business_model[]),
  ('LTV / CAC', 'revenue', 'calculated', '((revenue / active_users) / (churned_mrr / (revenue - churned_mrr + 0.0001))) / (marketing_spend / new_users)', 'x', 'LTV / CAC', 'Ratio entre el valor del cliente y el costo de adquirirlo.', 'El santo grial de unit economics. >3x es saludable, >5x es excelente.', '> 3x saludable, > 5x excelente.', 13, true, ARRAY['saas','marketplace']::business_model[]),
  ('Churn Rate', 'retention', 'calculated', '(churned_mrr / (revenue - churned_mrr + 0.0001)) * 100', '%', 'MRR Perdido / MRR Inicial', 'Porcentaje de revenue recurrente perdido por cancelaciones.', 'Crecimiento sin retención = balde con agujeros.', 'SaaS B2B: <2%/mes. SaaS SMB: <5%/mes.', 14, true, ARRAY['saas']::business_model[]),
  ('Net New MRR', 'revenue', 'calculated', 'new_mrr - churned_mrr', 'USD', 'Nuevo MRR - MRR Perdido', 'Crecimiento neto del MRR este mes.', 'Indica si estás expandiendo o contrayendo el revenue base.', 'Debería ser consistentemente positivo y creciendo.', 15, true, ARRAY['saas']::business_model[]),
  ('Runway', 'cash_efficiency', 'calculated', 'cash_balance / (monthly_burn + 0.0001)', 'meses', 'Cash / Burn Mensual', 'Cuántos meses de operación tenés antes de quedarte sin cash.', 'Define la urgencia de levantar. Inversores quieren verte con 12-18 meses.', 'Levantá cuando tengas 6-9 meses; quebrás con 3.', 16, true, ARRAY['saas','marketplace','ecommerce','b2b_services','consumer','other']::business_model[]),
  ('Burn Multiple', 'cash_efficiency', 'calculated', 'monthly_burn / (new_mrr + 0.0001)', 'x', 'Burn / Nuevo MRR', 'Cuánto cash quemás por cada dólar de MRR nuevo.', 'Mide eficiencia de capital. <1x es excelente, >2x prende alarmas.', '<1x excelente, 1-2x bueno, >3x ineficiente.', 17, true, ARRAY['saas']::business_model[]);