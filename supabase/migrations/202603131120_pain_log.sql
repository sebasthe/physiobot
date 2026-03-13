CREATE TABLE IF NOT EXISTS public.pain_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  exercise_id TEXT NOT NULL,
  location TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 10),
  type TEXT NOT NULL,
  data_class TEXT NOT NULL DEFAULT 'D' CHECK (data_class = 'D'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pain_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own pain log" ON public.pain_log;
CREATE POLICY "Users can read own pain log"
  ON public.pain_log FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own pain log" ON public.pain_log;
CREATE POLICY "Users can insert own pain log"
  ON public.pain_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);
