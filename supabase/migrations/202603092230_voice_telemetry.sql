CREATE TABLE IF NOT EXISTS public.voice_telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_telemetry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own voice telemetry" ON public.voice_telemetry_events;
CREATE POLICY "Users read own voice telemetry"
  ON public.voice_telemetry_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own voice telemetry" ON public.voice_telemetry_events;
CREATE POLICY "Users insert own voice telemetry"
  ON public.voice_telemetry_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
