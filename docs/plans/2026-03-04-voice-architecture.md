# Voice Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a `VoicePlayer` abstraction that pre-generates all session audio before training starts (zero in-session latency), with Browser TTS as instant fallback — designed so real-time streaming can be added in Phase 2 without touching calling code.

**Architecture:** Client-side `VoicePlayer` singleton manages a `Map<cueId, Blob>` cache. Before a session starts, `prepare(cues[])` calls `/api/voice` for each cue in parallel and fills the cache. During training, `play(cue)` resolves from cache instantly; if no blob exists it falls back to Browser TTS. The `/api/voice` server route proxies ElevenLabs and keeps the API key server-side.

**Tech Stack:** Next.js 15 API Routes, ElevenLabs REST API, Web Speech API (browser), Vitest + jsdom, TypeScript

**Supersedes:** Task 9 from `docs/plans/2026-03-03-physiobot-mvp.md` (that plan's voice layer is replaced by this one)

---

## Task 1: VoiceCue Types

**Files:**
- Create: `lib/voice/types.ts`

**Step 1: Create types**

Create `lib/voice/types.ts`:
```typescript
export interface VoiceCue {
  id: string
  text: string
}
```

**Step 2: Commit**

```bash
git add lib/voice/types.ts
git commit -m "feat: add VoiceCue type"
```

---

## Task 2: Browser TTS Wrapper

**Files:**
- Create: `lib/voice/browser-tts.ts`
- Create: `tests/lib/voice/browser-tts.test.ts`

**Step 1: Write failing test**

Create `tests/lib/voice/browser-tts.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { speakWithBrowserTTS, stopBrowserTTS } from '@/lib/voice/browser-tts'

describe('speakWithBrowserTTS', () => {
  beforeEach(() => {
    const mockSpeak = vi.fn()
    const mockCancel = vi.fn()
    Object.defineProperty(globalThis, 'window', {
      value: {
        speechSynthesis: {
          speak: mockSpeak,
          cancel: mockCancel,
        },
      },
      writable: true,
    })
  })

  it('calls speechSynthesis.speak with an utterance', () => {
    const utterance = new SpeechSynthesisUtterance('test')
    utterance.dispatchEvent(new Event('end'))
    speakWithBrowserTTS('Hallo Welt')
    expect(window.speechSynthesis.speak).toHaveBeenCalled()
  })

  it('resolves without throwing in SSR (no window)', async () => {
    const original = globalThis.window
    // @ts-expect-error
    delete globalThis.window
    await expect(speakWithBrowserTTS('test')).resolves.toBeUndefined()
    globalThis.window = original
  })

  it('stopBrowserTTS calls cancel', () => {
    stopBrowserTTS()
    expect(window.speechSynthesis.cancel).toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/lib/voice/browser-tts.test.ts
```

Expected: FAIL — `speakWithBrowserTTS` not found

**Step 3: Implement**

Create `lib/voice/browser-tts.ts`:
```typescript
export function speakWithBrowserTTS(text: string, lang = 'de-DE'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 1.0
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

export function stopBrowserTTS(): void {
  if (typeof window !== 'undefined') {
    window.speechSynthesis.cancel()
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run tests/lib/voice/browser-tts.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add lib/voice/browser-tts.ts tests/lib/voice/browser-tts.test.ts
git commit -m "feat: add browser TTS wrapper"
```

---

## Task 3: ElevenLabs API Route

**Files:**
- Create: `app/api/voice/route.ts`

No unit test needed here — this is a thin proxy. Will be covered by integration in Task 4.

**Step 1: Create route**

Create `app/api/voice/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await request.json()
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB'

  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 })
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  )

  if (!response.ok) {
    return NextResponse.json({ error: 'ElevenLabs error' }, { status: 502 })
  }

  const audio = await response.arrayBuffer()
  return new NextResponse(audio, {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}
```

**Step 2: Commit**

```bash
git add app/api/voice/route.ts
git commit -m "feat: add ElevenLabs voice proxy API route"
```

---

## Task 4: Synthesize Function

**Files:**
- Create: `lib/voice/synthesize.ts`
- Create: `tests/lib/voice/synthesize.test.ts`

**Step 1: Write failing test**

Create `tests/lib/voice/synthesize.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { synthesizeCue } from '@/lib/voice/synthesize'

describe('synthesizeCue', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls /api/voice with the cue text', async () => {
    const fakeBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
    } as Response)

    const result = await synthesizeCue('Hallo Welt')

    expect(fetch).toHaveBeenCalledWith('/api/voice', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: 'Hallo Welt' }),
    }))
    expect(result).toBeInstanceOf(Blob)
  })

  it('throws when the API returns an error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
    } as Response)

    await expect(synthesizeCue('test')).rejects.toThrow('Voice synthesis failed')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/lib/voice/synthesize.test.ts
```

Expected: FAIL — `synthesizeCue` not found

**Step 3: Implement**

Create `lib/voice/synthesize.ts`:
```typescript
export async function synthesizeCue(text: string): Promise<Blob> {
  const response = await fetch('/api/voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    throw new Error('Voice synthesis failed')
  }

  return response.blob()
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run tests/lib/voice/synthesize.test.ts
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add lib/voice/synthesize.ts tests/lib/voice/synthesize.test.ts
git commit -m "feat: add synthesizeCue function"
```

---

## Task 5: VoicePlayer Singleton

**Files:**
- Create: `lib/voice/player.ts`
- Create: `tests/lib/voice/player.test.ts`

**Step 1: Write failing tests**

Create `tests/lib/voice/player.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/voice/synthesize', () => ({
  synthesizeCue: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' })),
}))

vi.mock('@/lib/voice/browser-tts', () => ({
  speakWithBrowserTTS: vi.fn().mockResolvedValue(undefined),
  stopBrowserTTS: vi.fn(),
}))

describe('VoicePlayer', () => {
  let player: Awaited<ReturnType<typeof import('@/lib/voice/player').createVoicePlayer>>

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/lib/voice/player')
    player = mod.createVoicePlayer()
  })

  it('prepare fills the cache for each cue', async () => {
    const { synthesizeCue } = await import('@/lib/voice/synthesize')
    const cues = [
      { id: 'ex1', text: 'Mobilisiere deinen Rücken' },
      { id: 'ex2', text: 'Hebe das Gesäß' },
    ]

    await player.prepare(cues)

    expect(synthesizeCue).toHaveBeenCalledTimes(2)
    expect(synthesizeCue).toHaveBeenCalledWith('Mobilisiere deinen Rücken')
  })

  it('play uses cached blob when available', async () => {
    const { speakWithBrowserTTS } = await import('@/lib/voice/browser-tts')
    const cue = { id: 'ex1', text: 'Test' }
    await player.prepare([cue])

    // Mock URL.createObjectURL since jsdom doesn't support it
    const mockPlay = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'URL', {
      value: { createObjectURL: vi.fn().mockReturnValue('blob:fake'), revokeObjectURL: vi.fn() },
      writable: true,
    })
    Object.defineProperty(globalThis, 'Audio', {
      value: vi.fn().mockImplementation(() => ({ play: mockPlay, src: '' })),
      writable: true,
    })

    await player.play(cue)

    expect(speakWithBrowserTTS).not.toHaveBeenCalled()
    expect(mockPlay).toHaveBeenCalled()
  })

  it('play falls back to browser TTS when no cache', async () => {
    const { speakWithBrowserTTS } = await import('@/lib/voice/browser-tts')
    const cue = { id: 'not-prepared', text: 'Fallback text' }

    await player.play(cue)

    expect(speakWithBrowserTTS).toHaveBeenCalledWith('Fallback text', expect.any(String))
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/lib/voice/player.test.ts
```

Expected: FAIL — `createVoicePlayer` not found

**Step 3: Implement VoicePlayer**

Create `lib/voice/player.ts`:
```typescript
import { synthesizeCue } from './synthesize'
import { speakWithBrowserTTS, stopBrowserTTS } from './browser-tts'
import type { VoiceCue } from './types'

export interface VoicePlayer {
  prepare(cues: VoiceCue[], onProgress?: (done: number, total: number) => void): Promise<void>
  play(cue: VoiceCue, lang?: string): Promise<void>
  stop(): void
}

export function createVoicePlayer(): VoicePlayer {
  const cache = new Map<string, Blob>()
  let currentAudio: HTMLAudioElement | null = null

  return {
    async prepare(cues, onProgress) {
      let done = 0
      await Promise.all(
        cues.map(async (cue) => {
          try {
            const blob = await synthesizeCue(cue.text)
            cache.set(cue.id, blob)
          } catch {
            // synthesis failed — will fall back to browser TTS at play time
          }
          done++
          onProgress?.(done, cues.length)
        })
      )
    },

    async play(cue, lang = 'de-DE') {
      const blob = cache.get(cue.id)
      if (blob) {
        const url = URL.createObjectURL(blob)
        currentAudio = new Audio(url)
        return new Promise((resolve) => {
          currentAudio!.onended = () => { URL.revokeObjectURL(url); resolve() }
          currentAudio!.onerror = () => { URL.revokeObjectURL(url); resolve() }
          currentAudio!.play()
        })
      }
      return speakWithBrowserTTS(cue.text, lang)
    },

    stop() {
      currentAudio?.pause()
      currentAudio = null
      stopBrowserTTS()
    },
  }
}

// Singleton for use in session components
export const voicePlayer = createVoicePlayer()
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:run tests/lib/voice/player.test.ts
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add lib/voice/player.ts tests/lib/voice/player.test.ts
git commit -m "feat: add VoicePlayer with cache-first resolution and browser TTS fallback"
```

---

## Task 6: Export Index

**Files:**
- Create: `lib/voice/index.ts`

**Step 1: Create index**

Create `lib/voice/index.ts`:
```typescript
export { voicePlayer, createVoicePlayer } from './player'
export { synthesizeCue } from './synthesize'
export { speakWithBrowserTTS, stopBrowserTTS } from './browser-tts'
export type { VoiceCue } from './types'
export type { VoicePlayer } from './player'
```

**Step 2: Run all voice tests together**

```bash
npm run test:run tests/lib/voice/
```

Expected: PASS (all tests in the voice folder)

**Step 3: Commit**

```bash
git add lib/voice/index.ts
git commit -m "feat: add voice module export index"
```

---

## Phase 2 Extension Points (not built now)

When real-time streaming is needed:

1. **Add `streamFn` to `VoiceCue`** — `streamFn?: () => AsyncIterable<string>`
2. **Extend `player.play()`** — if no cache hit and `streamFn` exists, pipe stream through ElevenLabs Streaming API before falling back to browser TTS
3. **No changes** to session components, `prepare()`, or the public `VoicePlayer` interface

The resolution order becomes: **cache → stream → browser TTS**.
