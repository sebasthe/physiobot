import MemoryClient from 'mem0ai'
import type { CoachingMemorySnapshot } from '@/lib/coach/types'
import { logPrivacyAuditEvent } from '@/lib/privacy/audit'
import { classifyMemory } from '@/lib/privacy/classifier'
import { canRetrieveMemory } from '@/lib/privacy/hooks'
import { DataClass, type ConsentLevel, isValidDataClass } from '@/lib/privacy/types'

interface MemorySearchResult {
  memory?: string
  metadata?: Record<string, unknown> | null
}

interface Mem0Client {
  search: (
    query: string,
    options: { user_id: string; limit: number },
  ) => Promise<MemorySearchResult[]>
}

const client = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
}) as unknown as Mem0Client

export class MemoryResolver {
  private cache = new Map<string, CoachingMemorySnapshot>()

  async getSessionSnapshot(
    userId: string,
    sessionCount: number,
    consent: ConsentLevel = 'full',
  ): Promise<CoachingMemorySnapshot> {
    const cacheKey = `${userId}:${sessionCount}:${consent}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const [motivationResults, personalityResults, trainingResults, lifeResults] = await Promise.all([
      client.search('Kern-Motivation und Warum des Trainings', { user_id: userId, limit: 3 }).catch(() => []),
      client.search('Persoenlichkeit und Kommunikationsstil', { user_id: userId, limit: 3 }).catch(() => []),
      client.search('Trainingsmuster, Schmerzpunkte und Ermuedung', { user_id: userId, limit: 3 }).catch(() => []),
      client.search('Lebenskontext, Beruf und Familie', { user_id: userId, limit: 3 }).catch(() => []),
    ])

    const filteredMotivation = this.filterResults(motivationResults, 'motivation_hints', consent)
    const filteredPersonality = this.filterResults(personalityResults, 'personality_preferences', consent)
    const filteredTraining = this.filterResults(trainingResults, 'training_patterns', consent)
    const filteredLife = this.filterResults(lifeResults, 'life_context', consent)

    const classDCount = filteredMotivation.classDCount
      + filteredPersonality.classDCount
      + filteredTraining.classDCount
      + filteredLife.classDCount
    if (classDCount > 0) {
      void logPrivacyAuditEvent({
        userId,
        eventType: 'class_d_read',
        dataClass: DataClass.MedicalRehab,
        payload: {
          action: 'retrieve',
          data_class: DataClass.MedicalRehab,
          memory_count: classDCount,
        },
      }).catch(() => undefined)
    }

    const snapshot: CoachingMemorySnapshot = {
      kernMotivation: this.extractFirst(filteredMotivation.results),
      personalityPrefs: this.parsePersonality(filteredPersonality.results),
      trainingPatterns: this.parseTraining(filteredTraining.results),
      lifeContext: this.extractAll(filteredLife.results),
      sessionCount,
    }

    this.cache.set(cacheKey, snapshot)
    return snapshot
  }

  clearCache(userId?: string): void {
    if (!userId) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key)
      }
    }
  }

  private extractFirst(results: MemorySearchResult[]): string | null {
    const first = results[0]?.memory?.trim()
    if (!first) {
      return null
    }

    return this.normalizeMemoryText(first)
  }

  private extractAll(results: MemorySearchResult[]): string[] {
    return results
      .map(result => this.normalizeMemoryText(result.memory?.trim() ?? ''))
      .filter(Boolean)
  }

  private parsePersonality(results: MemorySearchResult[]): CoachingMemorySnapshot['personalityPrefs'] {
    if (results.length === 0) {
      return null
    }

    const text = results.map(result => result.memory ?? '').join(' ').toLowerCase()
    return {
      communicationStyle: text.includes('direkt') ? 'direkt' : 'einfuehlsam',
      encouragementType: text.includes('herausforderung') || text.includes('challenge')
        ? 'challenge-driven'
        : 'supportive',
    }
  }

  private parseTraining(results: MemorySearchResult[]): CoachingMemorySnapshot['trainingPatterns'] {
    if (results.length === 0) {
      return null
    }

    const text = results.map(result => result.memory ?? '').join(' ')
    return {
      knownPainPoints: this.extractKeywords(text, ['Schulter', 'Knie', 'Ruecken', 'Rucken', 'Nacken', 'Huefte', 'Hufte']),
      preferredExercises: this.extractKeywords(text, ['Squat', 'Plank', 'Bruecke', 'Bridge', 'Mobilisation']),
      fatigueSignals: this.extractKeywords(text, ['einsilbig', 'atmet schwer', 'langsamer', 'stiller', 'muede', 'mude']),
    }
  }

  private normalizeMemoryText(text: string): string {
    return text.replace(/^[^:]+:\s*/, '').trim()
  }

  private extractKeywords(text: string, keywords: string[]): string[] {
    const lower = text.toLowerCase()
    return keywords.filter(keyword => lower.includes(keyword.toLowerCase()))
  }

  private filterResults(
    results: MemorySearchResult[],
    category: 'motivation_hints' | 'personality_preferences' | 'training_patterns' | 'life_context',
    consent: ConsentLevel,
  ): { results: MemorySearchResult[]; classDCount: number } {
    let classDCount = 0
    const filtered = results.filter(result => {
      const memory = result.memory?.trim()
      if (!memory) {
        return false
      }

      const dataClass = this.resolveDataClass(category, result)
      const allowed = canRetrieveMemory({ dataClass, consent })
      if (allowed && dataClass === DataClass.MedicalRehab) {
        classDCount += 1
      }

      return allowed
    })

    return { results: filtered, classDCount }
  }

  private resolveDataClass(
    category: 'motivation_hints' | 'personality_preferences' | 'training_patterns' | 'life_context',
    result: MemorySearchResult,
  ): DataClass {
    const dataClassValue = result.metadata?.data_class
    if (isValidDataClass(dataClassValue)) {
      return dataClassValue
    }

    return classifyMemory(category, result.memory ?? '')
  }
}
