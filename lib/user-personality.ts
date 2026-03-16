import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Language, UserPersonality } from '@/lib/types'

export const DEFAULT_USER_PERSONALITY = {
  motivation_style: 'mixed',
  feedback_style: 'energetic',
  language: 'de',
  coach_persona: 'tony_robbins',
} satisfies UserPersonality

export async function saveUserLanguagePreference(
  supabase: Pick<SupabaseClient, 'from'>,
  userId: string,
  language: Language
): Promise<{ error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('user_personality')
    .update({ language })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle()

  if (error || data) {
    return { error }
  }

  const { error: insertError } = await supabase.from('user_personality').insert({
    user_id: userId,
    ...DEFAULT_USER_PERSONALITY,
    language,
  })

  return { error: insertError }
}
