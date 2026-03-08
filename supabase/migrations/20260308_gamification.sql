ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS name TEXT;

CREATE TABLE IF NOT EXISTS public.streaks (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current INTEGER NOT NULL DEFAULT 0,
  longest INTEGER NOT NULL DEFAULT 0,
  last_session DATE,
  freeze_days INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.badges_earned (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS public.schedules (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  days INTEGER[] NOT NULL DEFAULT '{1,3,5}',
  notify_time TIME NOT NULL DEFAULT '07:30',
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges_earned ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own streak" ON public.streaks;
CREATE POLICY "Users manage own streak"
  ON public.streaks FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own XP events" ON public.xp_events;
CREATE POLICY "Users read own XP events"
  ON public.xp_events FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service inserts XP events" ON public.xp_events;
CREATE POLICY "Service inserts XP events"
  ON public.xp_events FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own badges" ON public.badges_earned;
CREATE POLICY "Users read own badges"
  ON public.badges_earned FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own schedule" ON public.schedules;
CREATE POLICY "Users manage own schedule"
  ON public.schedules FOR ALL USING (auth.uid() = user_id);
