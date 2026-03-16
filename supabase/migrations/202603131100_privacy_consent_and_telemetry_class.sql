ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_consent TEXT NOT NULL DEFAULT 'full'
  CHECK (privacy_consent IN ('full', 'minimal', 'none'));

ALTER TABLE public.voice_telemetry_events
  ADD COLUMN IF NOT EXISTS data_class TEXT NOT NULL DEFAULT 'A'
  CHECK (data_class IN ('A', 'B', 'C', 'D'));

CREATE INDEX IF NOT EXISTS voice_telemetry_events_user_data_class_created_at_idx
  ON public.voice_telemetry_events (user_id, data_class, created_at DESC);
