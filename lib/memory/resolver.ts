import MemoryClient from 'mem0ai'
import type { CoachingMemorySnapshot } from '@/lib/coach/types'

const client = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
})

interface MemorySearchResult {
  memory?: string
}

export class MemoryResolver {
  private cache = new Map<string, CoachingMemorySnapshot>()

  async getSessionSnapshot(userId: string, sessionCount: number): Promise<CoachingMemorySnapshot> {
    const cacheKey = `${userId}:${sessionCount}`
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

    const snapshot: CoachingMemorySnapshot = {
      kernMotivation: this.extractFirst(motivationResults),
      personalityPrefs: this.parsePersonality(personalityResults),
      trainingPatterns: this.parseTraining(trainingResults),
      lifeContext: this.extractAll(lifeResults),
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

    return first.replace(/^[^:]+:\s*/, '').trim()
  }

  private extractAll(results: MemorySearchResult[]): string[] {
    return results
      .map(result => result.memory?.trim() ?? '')
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

  private extractKeywords(text: string, keywords: string[]): string[] {
    const lower = text.toLowerCase()
    return keywords.filter(keyword => lower.includes(keyword.toLowerCase()))
  }
}
