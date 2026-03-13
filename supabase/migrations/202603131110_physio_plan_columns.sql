ALTER TABLE public.training_plans
  ADD COLUMN IF NOT EXISTS contraindications TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS therapist_notes TEXT,
  ADD COLUMN IF NOT EXISTS exercise_modifications JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mobility_baseline JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'fitness'
  CHECK (plan_type IN ('fitness', 'physio'));
