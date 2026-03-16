ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE public.physio_patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients read own physio mapping" ON public.physio_patients;
CREATE POLICY "Patients read own physio mapping"
  ON public.physio_patients FOR SELECT
  USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "Physios read own patient mapping" ON public.physio_patients;
CREATE POLICY "Physios read own patient mapping"
  ON public.physio_patients FOR SELECT
  USING (auth.uid() = physio_id);

DROP POLICY IF EXISTS "Patients read assigned physio profile" ON public.profiles;
CREATE POLICY "Patients read assigned physio profile"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.physio_patients
      WHERE public.physio_patients.patient_id = auth.uid()
        AND public.physio_patients.physio_id = profiles.id
    )
  );
