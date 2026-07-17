ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS task_id uuid;
CREATE INDEX IF NOT EXISTS idx_documents_task_id ON public.documents(task_id);