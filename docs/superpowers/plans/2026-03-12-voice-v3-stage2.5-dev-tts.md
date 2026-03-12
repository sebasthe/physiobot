# Voice V3 Stage 2.5: Dev/Testing TTS Provider (Kokoro)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free, local TTS provider using Kokoro (82M param ONNX model via `kokoro-js`) so development and testing doesn't burn ElevenLabs credits. Selectable via `NEXT_PUBLIC_VOICE_PROVIDER=kokoro`.

**Architecture:** A new `KokoroTTS` class implements the existing `TTSProvider` interface. The model runs client-side in the browser via WebGPU/WASM — no server, no API keys. `VoiceConfig.tts` gains a `'kokoro'` option. The provider lazy-loads the model on first `speak()` call to avoid blocking app startup. German voice is selected from Kokoro's multilingual voices.

**Tech Stack:** [kokoro-js](https://www.npmjs.com/package/kokoro-js) (ONNX via Transformers.js), WebGPU/WASM, Vitest

**Branch:** `feature/voice-v3-coach-brain` (same as Stage 2 — this is a small addition)

**Prerequisite:** Stage 1 must be merged to `main`.

---

## Chunk 1: Kokoro TTS Provider

### Task 1: Install kokoro-js

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

Run: `npm install kokoro-js`

- [ ] **Step 2: Verify installation**

Run: `npm ls kokoro-js`
Expected: `kokoro-js@<version>`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add kokoro-js for local dev TTS"
```

---

### Task 2: Create KokoroTTS provider

**Files:**
- Create: `lib/voice-module/providers/tts/KokoroTTS.ts`
- Test: `tests/lib/voice-module/providers/tts/KokoroTTS.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/providers/tts/KokoroTTS.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock kokoro-js — we can't load the ONNX model in CI
const mockGenerate = vi.fn().mockResolvedValue({
  toBlob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/wav' })),
})
const mockFromPretrained = vi.fn().mockResolvedValue({
  generate: mockGenerate,
  voices: ['af_bella', 'de_mia'],
})

vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: mockFromPretrained,
  },
}))

// Mock Audio
vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  onended: null as (() => void) | null,
  onerror: null as ((e: unknown) => void) | null,
  src: '',
})))
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:url'),
  revokeObjectURL: vi.fn(),
})

import { KokoroTTS } from '@/lib/voice-module/providers/tts/KokoroTTS'

describe('KokoroTTS', () => {
  let tts: KokoroTTS

  beforeEach(() => {
    vi.clearAllMocks()
    tts = new KokoroTTS({ voice: 'de_mia', dtype: 'q8' })
  })

  it('implements TTSProvider interface', () => {
    expect(tts.speak).toBeDefined()
    expect(tts.stop).toBeDefined()
    expect(tts.isSpeaking).toBeDefined()
  })

  it('is not speaking initially', () => {
    expect(tts.isSpeaking()).toBe(false)
  })

  it('lazy-loads model on first speak()', async () => {
    expect(mockFromPretrained).not.toHaveBeenCalled()

    const promise = tts.speak('Hallo')
    // Trigger audio end
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    const audioInstance = AudioCtor.mock.results[0]?.value
    audioInstance?.onended?.()
    await promise

    expect(mockFromPretrained).toHaveBeenCalledTimes(1)
  })

  it('reuses model on subsequent speak() calls', async () => {
    const p1 = tts.speak('Eins')
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    AudioCtor.mock.results[0]?.value?.onended?.()
    await p1

    const p2 = tts.speak('Zwei')
    AudioCtor.mock.results[1]?.value?.onended?.()
    await p2

    expect(mockFromPretrained).toHaveBeenCalledTimes(1)
  })

  it('calls generate with configured voice', async () => {
    const promise = tts.speak('Test')
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    AudioCtor.mock.results[0]?.value?.onended?.()
    await promise

    expect(mockGenerate).toHaveBeenCalledWith('Test', { voice: 'de_mia' })
  })

  it('stop cancels current audio', async () => {
    // Start speaking (don't await)
    tts.speak('Langer Text der abgebrochen wird')
    tts.stop()
    expect(tts.isSpeaking()).toBe(false)
  })

  it('skips empty text', async () => {
    await tts.speak('')
    expect(mockGenerate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/providers/tts/KokoroTTS.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the KokoroTTS provider**

```typescript
// lib/voice-module/providers/tts/KokoroTTS.ts
import type { TTSProvider } from './TTSProvider'

interface KokoroTTSConfig {
  voice?: string
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
  modelId?: string
}

export class KokoroTTS implements TTSProvider {
  private config: Required<KokoroTTSConfig>
  private model: Awaited<ReturnType<typeof import('kokoro-js')['KokoroTTS']['from_pretrained']>> | null = null
  private loading: Promise<void> | null = null
  private currentAudio: HTMLAudioElement | null = null
  private speaking = false

  constructor(config: KokoroTTSConfig = {}) {
    this.config = {
      voice: config.voice ?? 'af_bella',
      dtype: config.dtype ?? 'q8',
      modelId: config.modelId ?? 'onnx-community/Kokoro-82M-v1.0-ONNX',
    }
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) return

    await this.ensureModel()

    const audio = await this.model!.generate(text, {
      voice: this.config.voice,
    })

    const blob = await audio.toBlob()
    await this.playBlob(blob)
  }

  stop(): void {
    this.speaking = false
    if (this.currentAudio) {
      this.currentAudio.pause()
      if (this.currentAudio.src) URL.revokeObjectURL(this.currentAudio.src)
      this.currentAudio = null
    }
  }

  isSpeaking(): boolean {
    return this.speaking
  }

  private async ensureModel(): Promise<void> {
    if (this.model) return
    if (this.loading) return this.loading

    this.loading = (async () => {
      const { KokoroTTS: KokoroEngine } = await import('kokoro-js')
      this.model = await KokoroEngine.from_pretrained(this.config.modelId, {
        dtype: this.config.dtype,
      })
    })()

    await this.loading
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      this.currentAudio = new Audio(url)
      this.speaking = true

      this.currentAudio.onended = () => {
        this.speaking = false
        URL.revokeObjectURL(url)
        this.currentAudio = null
        resolve()
      }

      this.currentAudio.onerror = (e) => {
        this.speaking = false
        URL.revokeObjectURL(url)
        this.currentAudio = null
        reject(new Error(`Kokoro audio playback error: ${e}`))
      }

      this.currentAudio.play().catch(reject)
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/providers/tts/KokoroTTS.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/providers/tts/KokoroTTS.ts tests/lib/voice-module/providers/tts/KokoroTTS.test.ts
git commit -m "feat(voice-module): add KokoroTTS provider for free local dev TTS"
```

---

### Task 3: Extend VoiceConfig to support Kokoro

**Files:**
- Modify: `lib/voice-module/core/types.ts`
- Modify: `lib/voice-module/index.ts`

- [ ] **Step 1: Add 'kokoro' to VoiceConfig tts union**

In `lib/voice-module/core/types.ts`, change:

```typescript
// Before
tts: 'elevenlabs' | 'browser'

// After
tts: 'elevenlabs' | 'browser' | 'kokoro'
```

- [ ] **Step 2: Export KokoroTTS from module index**

In `lib/voice-module/index.ts`, add:

```typescript
export { KokoroTTS } from './providers/tts/KokoroTTS'
```

- [ ] **Step 3: Run full test suite to check nothing breaks**

Run: `npx vitest run`
Expected: PASS — existing code uses `'elevenlabs' | 'browser'` which still works, just wider union now

- [ ] **Step 4: Commit**

```bash
git add lib/voice-module/core/types.ts lib/voice-module/index.ts
git commit -m "feat(voice-module): extend VoiceConfig with kokoro TTS option"
```

---

### Task 4: Wire Kokoro into SessionPlayer provider factory

**Files:**
- Modify: `app/training/session/page.tsx` (or wherever TTS provider is instantiated)

- [ ] **Step 1: Find where TTS provider is created**

Search for where `VoiceConfig.tts` or `NEXT_PUBLIC_VOICE_PROVIDER` is read and the TTS provider is instantiated. This is likely in `app/training/session/page.tsx` or `components/training/SessionPlayer.tsx`.

- [ ] **Step 2: Add kokoro case to the provider factory**

```typescript
import { KokoroTTS } from '@/lib/voice-module'
import { ElevenLabsTTS } from '@/lib/voice-module'
import { BrowserTTS } from '@/lib/voice-module'

function createTTSProvider(): TTSProvider {
  const provider = process.env.NEXT_PUBLIC_VOICE_PROVIDER

  switch (provider) {
    case 'elevenlabs':
      return new ElevenLabsTTS({
        streamEndpoint: '/api/voice/stream',
        fullEndpoint: '/api/voice',
        maxStreamLength: 1200,
      })
    case 'kokoro':
      return new KokoroTTS({
        voice: 'af_bella',  // or a German voice when available
        dtype: 'q8',
      })
    case 'browser':
    default:
      return new BrowserTTS({ language: 'de-DE' })
  }
}
```

- [ ] **Step 3: Update .env.local documentation**

Add a comment or update `.env.example` (if it exists):

```bash
# TTS provider: 'elevenlabs' (production), 'kokoro' (free local), 'browser' (fallback)
NEXT_PUBLIC_VOICE_PROVIDER=kokoro
```

- [ ] **Step 4: Run dev server and test**

Run: `npm run dev`

1. Set `NEXT_PUBLIC_VOICE_PROVIDER=kokoro` in `.env.local`
2. Start a training session
3. First `speak()` call will take a few seconds (model download + init)
4. Subsequent calls should be fast
5. Verify audio plays and sounds reasonable

- [ ] **Step 5: Commit**

```bash
git add app/training/session/page.tsx
git commit -m "feat: wire Kokoro TTS into provider factory for free dev/testing"
```

---

### Task 5: Add model loading indicator

**Files:**
- Modify: `lib/voice-module/providers/tts/KokoroTTS.ts`
- Modify: `components/training/SessionPlayer.tsx` (optional UX improvement)

The first `speak()` call downloads ~80MB of model weights. The user should know what's happening.

- [ ] **Step 1: Add onLoading callback to KokoroTTS**

```typescript
// Add to KokoroTTSConfig
interface KokoroTTSConfig {
  voice?: string
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
  modelId?: string
  onLoadingChange?: (loading: boolean) => void
}
```

In `ensureModel()`:

```typescript
private async ensureModel(): Promise<void> {
  if (this.model) return
  if (this.loading) return this.loading

  this.config.onLoadingChange?.(true)
  this.loading = (async () => {
    const { KokoroTTS: KokoroEngine } = await import('kokoro-js')
    this.model = await KokoroEngine.from_pretrained(this.config.modelId, {
      dtype: this.config.dtype,
    })
  })()

  await this.loading
  this.config.onLoadingChange?.(false)
}
```

- [ ] **Step 2: Show loading state in SessionPlayer (optional)**

If Kokoro is the active provider, show "Sprachmodell wird geladen..." on first interaction. This is a nice-to-have — the model caches in the browser after first load, so subsequent visits are fast.

- [ ] **Step 3: Commit**

```bash
git add lib/voice-module/providers/tts/KokoroTTS.ts components/training/SessionPlayer.tsx
git commit -m "feat(voice-module): add model loading callback to KokoroTTS"
```

---

### Task 6: Verify German voice quality and pick best voice

**Files:** none — this is a manual testing task

- [ ] **Step 1: Check available Kokoro voices**

Run in browser console or a test script:

```typescript
import { KokoroTTS } from 'kokoro-js'
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8' })
console.log(tts.voices) // List available voices
```

Kokoro v1.0 has limited German voices. Check which ones exist and test them with the sample script:

> "Hey, schön dass du da bist. Wir haben heute einiges vor — aber du weißt ja, warum du hier bist. Lass uns das zusammen durchziehen. Bereit? Dann los."

- [ ] **Step 2: Update default voice if a better German option exists**

If a German-specific voice (e.g., `de_*`) sounds better than `af_bella`, update the default in `KokoroTTS` constructor and the factory in SessionPlayer.

- [ ] **Step 3: Document findings**

Add a comment in `KokoroTTS.ts` noting which voice was tested and selected, and any quality observations.

- [ ] **Step 4: Commit if changes were made**

```bash
git add lib/voice-module/providers/tts/KokoroTTS.ts
git commit -m "chore: select best Kokoro voice for German coaching"
```
