
-- Add "other" to doc_category: documents that don't map to any Data Room
-- pillar (no roadmap linkage), per the "Otros" category in the UI.
ALTER TYPE public.doc_category ADD VALUE IF NOT EXISTS 'other';
