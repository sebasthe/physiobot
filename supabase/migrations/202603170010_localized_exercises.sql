WITH transformed_plans AS (
  SELECT
    training_plans.id AS plan_id,
    jsonb_agg(
      CASE
        WHEN exercise ? 'translations' THEN exercise
        ELSE (
          (exercise - 'name' - 'description' - 'voice_script')
          || jsonb_build_object(
            'id',
            COALESCE(
              NULLIF(exercise->>'id', ''),
              CONCAT(
                'exercise-',
                ordinality,
                '-',
                SUBSTRING(md5(COALESCE(exercise->>'name', 'exercise')) FOR 8)
              )
            ),
            'translations',
            jsonb_build_object(
              'de',
              jsonb_build_object(
                'name', COALESCE(exercise->>'name', CONCAT('Exercise ', ordinality)),
                'description', COALESCE(exercise->>'description', ''),
                'voice_script', COALESCE(exercise->>'voice_script', '')
              ),
              'en',
              jsonb_build_object(
                'name', COALESCE(exercise->>'name', CONCAT('Exercise ', ordinality)),
                'description', COALESCE(exercise->>'description', ''),
                'voice_script', COALESCE(exercise->>'voice_script', '')
              )
            )
          )
        )
      END
      ORDER BY ordinality
    ) AS localized_exercises
  FROM public.training_plans
  CROSS JOIN LATERAL jsonb_array_elements(public.training_plans.exercises) WITH ORDINALITY AS exercises(exercise, ordinality)
  GROUP BY training_plans.id
)
UPDATE public.training_plans
SET exercises = transformed_plans.localized_exercises
FROM transformed_plans
WHERE public.training_plans.id = transformed_plans.plan_id;
