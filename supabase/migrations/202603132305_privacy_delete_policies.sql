DROP POLICY IF EXISTS "Users can delete own pain log" ON public.pain_log;
CREATE POLICY "Users can delete own pain log"
  ON public.pain_log FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own voice telemetry" ON public.voice_telemetry_events;
CREATE POLICY "Users delete own voice telemetry"
  ON public.voice_telemetry_events FOR DELETE
  USING (auth.uid() = user_id);
