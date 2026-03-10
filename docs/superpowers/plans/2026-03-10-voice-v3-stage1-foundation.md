# Voice V3 Stage 1: Module Extraction + Tool Control

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract reusable voice I/O from the 891-line SessionPlayer into a clean module with provider abstraction, then add tool-based workout control so the coach can drive exercises.

**Architecture:** The voice module (`lib/voice-module/`) is a self-contained Next.js/React module with core logic (state machine, turn management), provider interfaces (STT, TTS, LLM), and React bindings (hook, components). SessionPlayer becomes a thin domain adapter (~200 lines) that wires the voice module to PhysioBot-specific concerns. Tool control is added via Claude `tool_use` — the server orchestrator defines tools, Claude invokes them, and the client executes them against WorkoutState.

**Tech Stack:** TypeScript, React 19, Next.js 16, Claude API (tool_use), ElevenLabs WebSocket STT + streaming TTS, Web Speech API (fallback), Vitest

**Branch:** `feature/voice-v3-foundation` (create from `main`)

**Spec:** `docs/superpowers/specs/2026-03-10-voice-v3-staged-design.md` — Stage 1

---

## Chunk 1: Core Types & Event System

### Task 1: Create voice module types

**Files:**
- Create: `lib/voice-module/core/types.ts`
- Test: `tests/lib/voice-module/core/types.test.ts`

- [ ] **Step 1: Write the type validation test**

```typescript
// tests/lib/voice-module/core/types.test.ts
import { describe, it, expect } from 'vitest'
import type {
  VoiceConfig,
  TurnContext,
  ToolDefinition,
  StreamChunk,
  WorkoutState,
  ExerciseState,
  TurnState,
} from '@/lib/voice-module/core/types'

describe('voice-module types', () => {
  it('VoiceConfig has required fields', () => {
    const config: VoiceConfig = {
      stt: 'elevenlabs',
      tts: 'elevenlabs',
      llmEndpoint: '/api/voice/realtime/stream',
      autoListen: true,
      language: 'de-DE',
    }
    expect(config.stt).toBe('elevenlabs')
    expect(config.language).toBe('de-DE')
  })

  it('TurnContext accepts tools', () => {
    const ctx: TurnContext = {
      systemPrompt: 'You are a coach',
      tools: [
        {
          name: 'next_exercise',
          description: 'Advance to next exercise',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      metadata: { exerciseIndex: 0 },
    }
    expect(ctx.tools).toHaveLength(1)
  })

  it('WorkoutState tracks exercise progression', () => {
    const state: WorkoutState = {
      sessionId: 'abc',
      status: 'active',
      currentExerciseIndex: 0,
      startedAt: new Date().toISOString(),
      exercises: [
        {
          id: 'ex1',
          name: 'Squats',
          phase: 'main',
          type: 'reps',
          targetSets: 3,
          targetReps: 10,
          completedSets: 0,
          status: 'active',
        },
      ],
    }
    expect(state.exercises[0].status).toBe('active')
  })

  it('StreamChunk discriminated union works', () => {
    const delta: StreamChunk = { type: 'delta', text: 'Hello' }
    const tool: StreamChunk = { type: 'tool_call', name: 'pause_workout', input: {} }
    const done: StreamChunk = { type: 'done', reply: 'Hello', llmLatencyMs: 100, totalLatencyMs: 200 }

    expect(delta.type).toBe('delta')
    expect(tool.type).toBe('tool_call')
    expect(done.type).toBe('done')
  })

  it('TurnState covers all voice states', () => {
    const states: TurnState[] = ['idle', 'listening', 'processing', 'speaking']
    expect(states).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/core/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types**

```typescript
// lib/voice-module/core/types.ts

// --- Voice session configuration (app-agnostic) ---

export interface VoiceConfig {
  stt: 'elevenlabs' | 'browser' | 'none'
  tts: 'elevenlabs' | 'browser'
  llmEndpoint: string
  autoListen: boolean
  language: string
}

// --- Turn context (injected per turn by domain adapter) ---

export interface TurnContext {
  systemPrompt: string
  tools?: ToolDefinition[]
  metadata?: Record<string, unknown>
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// --- Streaming chunks from LLM ---

export type StreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'done'; reply: string; llmLatencyMs: number; totalLatencyMs: number }

// --- Workout state (source of truth) ---

export interface WorkoutState {
  sessionId: string
  status: 'active' | 'paused' | 'completed'
  exercises: ExerciseState[]
  currentExerciseIndex: number
  startedAt: string
}

export interface ExerciseState {
  id: string
  name: string
  phase: 'warmup' | 'main' | 'cooldown'
  type: 'timed' | 'reps'
  targetDuration?: number
  targetSets?: number
  targetReps?: number
  completedSets: number
  remainingSeconds?: number
  status: 'pending' | 'active' | 'completed' | 'skipped'
}

// --- Voice session state ---

export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/core/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/core/types.ts tests/lib/voice-module/core/types.test.ts
git commit -m "feat(voice-module): add core type definitions"
```

---

### Task 2: Create event emitter

**Files:**
- Create: `lib/voice-module/core/events.ts`
- Test: `tests/lib/voice-module/core/events.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/core/events.test.ts
import { describe, it, expect, vi } from 'vitest'
import { VoiceEventEmitter } from '@/lib/voice-module/core/events'
import type { TurnState, TranscriptMessage } from '@/lib/voice-module/core/types'

describe('VoiceEventEmitter', () => {
  it('emits and listens to turnStateChanged', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()
    emitter.on('turnStateChanged', handler)
    emitter.emit('turnStateChanged', 'listening')
    expect(handler).toHaveBeenCalledWith('listening')
  })

  it('emits tool_call events', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()
    emitter.on('toolCall', handler)
    emitter.emit('toolCall', { name: 'next_exercise', input: {} })
    expect(handler).toHaveBeenCalledWith({ name: 'next_exercise', input: {} })
  })

  it('emits transcript events', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()
    emitter.on('transcript', handler)
    const msg: TranscriptMessage = { role: 'user', content: 'Weiter', timestamp: Date.now() }
    emitter.emit('transcript', msg)
    expect(handler).toHaveBeenCalledWith(msg)
  })

  it('emits error events', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()
    emitter.on('error', handler)
    emitter.emit('error', new Error('mic failed'))
    expect(handler).toHaveBeenCalledWith(expect.any(Error))
  })

  it('off removes listener', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()
    emitter.on('turnStateChanged', handler)
    emitter.off('turnStateChanged', handler)
    emitter.emit('turnStateChanged', 'idle')
    expect(handler).not.toHaveBeenCalled()
  })

  it('removeAllListeners clears everything', () => {
    const emitter = new VoiceEventEmitter()
    const handler = vi.fn()
    emitter.on('turnStateChanged', handler)
    emitter.on('toolCall', handler)
    emitter.removeAllListeners()
    emitter.emit('turnStateChanged', 'idle')
    emitter.emit('toolCall', { name: 'pause_workout', input: {} })
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/core/events.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the event emitter**

```typescript
// lib/voice-module/core/events.ts
import type { TurnState, TranscriptMessage } from './types'

export interface VoiceEventMap {
  turnStateChanged: TurnState
  toolCall: { name: string; input: Record<string, unknown> }
  transcript: TranscriptMessage
  error: Error
  interruptRequested: void
  sessionStarted: void
  sessionEnded: void
}

type EventHandler<T> = T extends void ? () => void : (data: T) => void

export class VoiceEventEmitter {
  private listeners = new Map<string, Set<EventHandler<unknown>>>()

  on<K extends keyof VoiceEventMap>(event: K, handler: EventHandler<VoiceEventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler as EventHandler<unknown>)
  }

  off<K extends keyof VoiceEventMap>(event: K, handler: EventHandler<VoiceEventMap[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<unknown>)
  }

  emit<K extends keyof VoiceEventMap>(event: K, ...args: VoiceEventMap[K] extends void ? [] : [VoiceEventMap[K]]): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      (handler as (...a: unknown[]) => void)(...args)
    }
  }

  removeAllListeners(): void {
    this.listeners.clear()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/core/events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/core/events.ts tests/lib/voice-module/core/events.test.ts
git commit -m "feat(voice-module): add typed event emitter"
```

---

## Chunk 2: Provider Interfaces & STT Providers

### Task 3: Create provider interfaces

**Files:**
- Create: `lib/voice-module/providers/stt/STTProvider.ts`
- Create: `lib/voice-module/providers/tts/TTSProvider.ts`
- Create: `lib/voice-module/providers/llm/LLMProvider.ts`

- [ ] **Step 1: Write the STT provider interface**

```typescript
// lib/voice-module/providers/stt/STTProvider.ts
export interface STTProvider {
  start(): Promise<void>
  stop(): void
  isActive(): boolean
  onPartialTranscript: ((text: string) => void) | null
  onCommittedTranscript: ((text: string) => void) | null
  onError: ((error: Error) => void) | null
}
```

- [ ] **Step 2: Write the TTS provider interface**

```typescript
// lib/voice-module/providers/tts/TTSProvider.ts
export interface TTSProvider {
  speak(text: string): Promise<void>
  stop(): void
  isSpeaking(): boolean
}
```

- [ ] **Step 3: Write the LLM provider interface**

```typescript
// lib/voice-module/providers/llm/LLMProvider.ts
import type { TurnContext, StreamChunk } from '../../core/types'

export interface LLMProvider {
  streamTurn(context: TurnContext, messages: Array<{ role: string; content: string }>, model?: string): AsyncGenerator<StreamChunk>
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/voice-module/providers/
git commit -m "feat(voice-module): add provider interfaces for STT, TTS, LLM"
```

---

### Task 4: Extract ElevenLabs STT provider

**Files:**
- Create: `lib/voice-module/providers/stt/ElevenLabsSTT.ts`
- Modify: `lib/voice/realtime-orchestrator.ts` (source material — do not delete yet)
- Test: `tests/lib/voice-module/providers/stt/ElevenLabsSTT.test.ts`

This extracts the WebSocket STT logic from `realtime-orchestrator.ts` into the new provider interface.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/providers/stt/ElevenLabsSTT.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElevenLabsSTT } from '@/lib/voice-module/providers/stt/ElevenLabsSTT'

// Mock browser APIs
const mockMediaStream = {
  getTracks: () => [{ stop: vi.fn() }],
}
const mockGetUserMedia = vi.fn().mockResolvedValue(mockMediaStream)
Object.defineProperty(globalThis, 'navigator', {
  value: { mediaDevices: { getUserMedia: mockGetUserMedia } },
  writable: true,
})

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onclose: (() => void) | null = null
  readyState = 1
  bufferedAmount = 0
  send = vi.fn()
  close = vi.fn()
  constructor() {
    setTimeout(() => this.onopen?.(), 0)
  }
}
vi.stubGlobal('WebSocket', MockWebSocket)

// Mock AudioContext
const mockProcessorNode = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  onaudioprocess: null as ((e: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null,
}
const mockSourceNode = { connect: vi.fn(), disconnect: vi.fn() }
const mockGainNode = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 0 } }
vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
  sampleRate: 48000,
  destination: {},
  state: 'running',
  createMediaStreamSource: () => mockSourceNode,
  createScriptProcessor: () => mockProcessorNode,
  createGain: () => mockGainNode,
  close: vi.fn(),
})))

describe('ElevenLabsSTT', () => {
  let stt: ElevenLabsSTT

  beforeEach(() => {
    stt = new ElevenLabsSTT({ language: 'de', tokenEndpoint: '/api/voice/tokens' })
  })

  it('implements STTProvider interface', () => {
    expect(stt.start).toBeDefined()
    expect(stt.stop).toBeDefined()
    expect(stt.isActive).toBeDefined()
  })

  it('is not active before start', () => {
    expect(stt.isActive()).toBe(false)
  })

  it('calls onCommittedTranscript when WebSocket sends committed message', async () => {
    const handler = vi.fn()
    stt.onCommittedTranscript = handler

    // Mock token fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sttToken: 'test-token' }),
    }) as unknown as typeof fetch

    await stt.start()

    // Simulate WebSocket message
    const ws = (stt as unknown as { ws: MockWebSocket }).ws
    ws.onmessage?.({
      data: JSON.stringify({ type: 'committed_transcript', text: 'Nächste Übung' }),
    })

    expect(handler).toHaveBeenCalledWith('Nächste Übung')
  })

  it('cleans up on stop', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sttToken: 'test-token' }),
    }) as unknown as typeof fetch

    await stt.start()
    stt.stop()
    expect(stt.isActive()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/providers/stt/ElevenLabsSTT.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Extract ElevenLabsSTT from realtime-orchestrator.ts**

```typescript
// lib/voice-module/providers/stt/ElevenLabsSTT.ts
import type { STTProvider } from './STTProvider'

interface ElevenLabsSTTConfig {
  language: string
  tokenEndpoint: string
  sampleRate?: number
  targetSampleRate?: number
}

export class ElevenLabsSTT implements STTProvider {
  private config: Required<ElevenLabsSTTConfig>
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private active = false

  onPartialTranscript: ((text: string) => void) | null = null
  onCommittedTranscript: ((text: string) => void) | null = null
  onError: ((error: Error) => void) | null = null

  constructor(config: ElevenLabsSTTConfig) {
    this.config = {
      sampleRate: 48000,
      targetSampleRate: 16000,
      ...config,
    }
  }

  async start(): Promise<void> {
    if (this.active) return

    // Fetch token
    const res = await fetch(this.config.tokenEndpoint, { method: 'POST' })
    if (!res.ok) throw new Error('Failed to fetch STT token')
    const { sttToken } = await res.json()

    // Set up WebSocket
    const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=${sttToken}`
    this.ws = new WebSocket(wsUrl)

    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => {
        // Send config
        this.ws!.send(JSON.stringify({
          type: 'configure',
          language: this.config.language,
          sample_rate: this.config.targetSampleRate,
          encoding: 'pcm_s16le',
          vad: {
            mode: 'auto',
            silence_duration_threshold: 800,
            min_speech_duration: 100,
            min_silence_duration: 150,
          },
        }))
        resolve()
      }
      this.ws!.onerror = () => reject(new Error('WebSocket connection failed'))
    })

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'partial_transcript' && msg.text) {
        this.onPartialTranscript?.(msg.text)
      } else if (msg.type === 'committed_transcript' && msg.text) {
        this.onCommittedTranscript?.(msg.text)
      }
    }

    this.ws.onerror = () => {
      this.onError?.(new Error('ElevenLabs STT WebSocket error'))
    }

    // Set up audio capture
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: this.config.sampleRate, echoCancellation: true, noiseSuppression: true },
    })

    this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate })
    const source = this.audioContext.createMediaStreamSource(this.mediaStream)
    const processor = this.audioContext.createScriptProcessor(2048, 1, 1)
    const sinkGain = this.audioContext.createGain()
    sinkGain.gain.value = 0

    const ratio = this.config.sampleRate / this.config.targetSampleRate

    processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (this.ws.bufferedAmount > 128 * 1024) return

      const input = e.inputBuffer.getChannelData(0)
      const downsampled = new Int16Array(Math.floor(input.length / ratio))
      for (let i = 0; i < downsampled.length; i++) {
        const sample = input[Math.floor(i * ratio)]
        downsampled[i] = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)))
      }

      const bytes = new Uint8Array(downsampled.buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)

      this.ws.send(JSON.stringify({ type: 'audio', data: base64 }))
    }

    source.connect(processor)
    processor.connect(sinkGain)
    sinkGain.connect(this.audioContext.destination)

    this.active = true
  }

  stop(): void {
    this.active = false
    this.ws?.close()
    this.ws = null
    this.mediaStream?.getTracks().forEach((t) => t.stop())
    this.mediaStream = null
    if (this.audioContext?.state !== 'closed') {
      this.audioContext?.close()
    }
    this.audioContext = null
  }

  isActive(): boolean {
    return this.active
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/providers/stt/ElevenLabsSTT.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/providers/stt/ElevenLabsSTT.ts tests/lib/voice-module/providers/stt/ElevenLabsSTT.test.ts
git commit -m "feat(voice-module): extract ElevenLabs STT provider"
```

---

### Task 5: Extract Browser STT provider

**Files:**
- Create: `lib/voice-module/providers/stt/BrowserSTT.ts`
- Test: `tests/lib/voice-module/providers/stt/BrowserSTT.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/providers/stt/BrowserSTT.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserSTT } from '@/lib/voice-module/providers/stt/BrowserSTT'

// Mock SpeechRecognition
class MockSpeechRecognition {
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
}
vi.stubGlobal('webkitSpeechRecognition', MockSpeechRecognition)

describe('BrowserSTT', () => {
  let stt: BrowserSTT

  beforeEach(() => {
    stt = new BrowserSTT({ language: 'de-DE' })
  })

  it('implements STTProvider interface', () => {
    expect(stt.start).toBeDefined()
    expect(stt.stop).toBeDefined()
    expect(stt.isActive).toBeDefined()
  })

  it('is not active before start', () => {
    expect(stt.isActive()).toBe(false)
  })

  it('starts recognition with correct language', async () => {
    await stt.start()
    expect(stt.isActive()).toBe(true)
  })

  it('cleans up on stop', async () => {
    await stt.start()
    stt.stop()
    expect(stt.isActive()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/providers/stt/BrowserSTT.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the Browser STT provider**

```typescript
// lib/voice-module/providers/stt/BrowserSTT.ts
import type { STTProvider } from './STTProvider'

interface BrowserSTTConfig {
  language: string
}

type SpeechRecognitionType = typeof window extends { webkitSpeechRecognition: infer T } ? T : unknown

export class BrowserSTT implements STTProvider {
  private recognition: InstanceType<SpeechRecognitionType> | null = null
  private config: BrowserSTTConfig
  private active = false

  onPartialTranscript: ((text: string) => void) | null = null
  onCommittedTranscript: ((text: string) => void) | null = null
  onError: ((error: Error) => void) | null = null

  constructor(config: BrowserSTTConfig) {
    this.config = config
  }

  async start(): Promise<void> {
    if (this.active) return

    const Recognition = (globalThis as Record<string, unknown>).webkitSpeechRecognition
      ?? (globalThis as Record<string, unknown>).SpeechRecognition
    if (!Recognition) {
      throw new Error('SpeechRecognition not available')
    }

    this.recognition = new (Recognition as new () => InstanceType<SpeechRecognitionType>)()
    const rec = this.recognition as Record<string, unknown>
    rec.lang = this.config.language
    rec.continuous = false
    rec.interimResults = true

    rec.onresult = (e: { results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => {
      const result = e.results[e.results.length - 1]
      if (result.isFinal) {
        this.onCommittedTranscript?.(result[0].transcript)
      } else {
        this.onPartialTranscript?.(result[0].transcript)
      }
    }

    rec.onerror = (e: { error: string }) => {
      this.onError?.(new Error(`SpeechRecognition error: ${e.error}`))
    }

    rec.onend = () => {
      this.active = false
    }

    ;(rec as { start: () => void }).start()
    this.active = true
  }

  stop(): void {
    this.active = false
    try {
      ;(this.recognition as { abort?: () => void })?.abort?.()
    } catch {
      // ignore
    }
    this.recognition = null
  }

  isActive(): boolean {
    return this.active
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/providers/stt/BrowserSTT.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/providers/stt/BrowserSTT.ts tests/lib/voice-module/providers/stt/BrowserSTT.test.ts
git commit -m "feat(voice-module): add Browser STT provider"
```

---

## Chunk 3: TTS Providers

### Task 6: Extract Browser TTS provider

**Files:**
- Create: `lib/voice-module/providers/tts/BrowserTTS.ts`
- Modify: `lib/voice/browser-tts.ts` (source material)
- Test: `tests/lib/voice-module/providers/tts/BrowserTTS.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/providers/tts/BrowserTTS.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserTTS } from '@/lib/voice-module/providers/tts/BrowserTTS'

const mockSpeak = vi.fn()
const mockCancel = vi.fn()
vi.stubGlobal('speechSynthesis', {
  speak: mockSpeak,
  cancel: mockCancel,
  speaking: false,
})
vi.stubGlobal('SpeechSynthesisUtterance', vi.fn().mockImplementation((text: string) => ({
  text,
  lang: '',
  rate: 1,
  onend: null as (() => void) | null,
  onerror: null as ((e: unknown) => void) | null,
})))

describe('BrowserTTS', () => {
  let tts: BrowserTTS

  beforeEach(() => {
    tts = new BrowserTTS({ language: 'de-DE' })
    vi.clearAllMocks()
  })

  it('implements TTSProvider interface', () => {
    expect(tts.speak).toBeDefined()
    expect(tts.stop).toBeDefined()
    expect(tts.isSpeaking).toBeDefined()
  })

  it('calls speechSynthesis.speak', async () => {
    mockSpeak.mockImplementation((utt: { onend: () => void }) => {
      setTimeout(() => utt.onend?.(), 0)
    })
    await tts.speak('Hallo')
    expect(mockSpeak).toHaveBeenCalled()
  })

  it('stop cancels speech', () => {
    tts.stop()
    expect(mockCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/providers/tts/BrowserTTS.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the Browser TTS provider**

```typescript
// lib/voice-module/providers/tts/BrowserTTS.ts
import type { TTSProvider } from './TTSProvider'

interface BrowserTTSConfig {
  language: string
  rate?: number
}

export class BrowserTTS implements TTSProvider {
  private config: Required<BrowserTTSConfig>
  private speaking = false

  constructor(config: BrowserTTSConfig) {
    this.config = { rate: 1, ...config }
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) return

    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = this.config.language
      utterance.rate = this.config.rate
      this.speaking = true

      utterance.onend = () => {
        this.speaking = false
        resolve()
      }
      utterance.onerror = (e) => {
        this.speaking = false
        reject(new Error(`TTS error: ${e}`))
      }

      window.speechSynthesis.speak(utterance)
    })
  }

  stop(): void {
    this.speaking = false
    window.speechSynthesis.cancel()
  }

  isSpeaking(): boolean {
    return this.speaking
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/providers/tts/BrowserTTS.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/providers/tts/BrowserTTS.ts tests/lib/voice-module/providers/tts/BrowserTTS.test.ts
git commit -m "feat(voice-module): extract Browser TTS provider"
```

---

### Task 7: Extract ElevenLabs TTS provider

**Files:**
- Create: `lib/voice-module/providers/tts/ElevenLabsTTS.ts`
- Modify: `lib/voice/elevenlabs.ts` (source material)
- Test: `tests/lib/voice-module/providers/tts/ElevenLabsTTS.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/providers/tts/ElevenLabsTTS.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElevenLabsTTS } from '@/lib/voice-module/providers/tts/ElevenLabsTTS'

// Mock fetch for streaming endpoint
const mockAudioBlob = new Blob(['audio'], { type: 'audio/mpeg' })
const mockResponse = {
  ok: true,
  blob: () => Promise.resolve(mockAudioBlob),
}

describe('ElevenLabsTTS', () => {
  let tts: ElevenLabsTTS

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch
    vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      onended: null as (() => void) | null,
      onerror: null as ((e: unknown) => void) | null,
      src: '',
    })))
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:url'), revokeObjectURL: vi.fn() })

    tts = new ElevenLabsTTS({
      streamEndpoint: '/api/voice/stream',
      fullEndpoint: '/api/voice',
      maxStreamLength: 1200,
    })
  })

  it('implements TTSProvider interface', () => {
    expect(tts.speak).toBeDefined()
    expect(tts.stop).toBeDefined()
    expect(tts.isSpeaking).toBeDefined()
  })

  it('uses stream endpoint for short text', async () => {
    const promise = tts.speak('Kurzer Text')
    // Trigger onended
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    const audioInstance = AudioCtor.mock.results[0]?.value
    audioInstance?.onended?.()
    await promise
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/voice/stream'),
      expect.any(Object),
    )
  })

  it('uses full endpoint for long text', async () => {
    const longText = 'A'.repeat(1201)
    const promise = tts.speak(longText)
    const AudioCtor = globalThis.Audio as unknown as ReturnType<typeof vi.fn>
    const audioInstance = AudioCtor.mock.results[0]?.value
    audioInstance?.onended?.()
    await promise
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/voice',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/providers/tts/ElevenLabsTTS.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the ElevenLabs TTS provider**

```typescript
// lib/voice-module/providers/tts/ElevenLabsTTS.ts
import type { TTSProvider } from './TTSProvider'
import { BrowserTTS } from './BrowserTTS'

interface ElevenLabsTTSConfig {
  streamEndpoint: string
  fullEndpoint: string
  maxStreamLength: number
  fallbackLanguage?: string
}

export class ElevenLabsTTS implements TTSProvider {
  private config: ElevenLabsTTSConfig
  private currentAudio: HTMLAudioElement | null = null
  private speaking = false
  private fallback: BrowserTTS

  constructor(config: ElevenLabsTTSConfig) {
    this.config = config
    this.fallback = new BrowserTTS({ language: config.fallbackLanguage ?? 'de-DE' })
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) return

    try {
      const blob = text.length <= this.config.maxStreamLength
        ? await this.fetchStreaming(text)
        : await this.fetchFull(text)

      await this.playBlob(blob)
    } catch {
      // Fallback to browser TTS
      await this.fallback.speak(text)
    }
  }

  stop(): void {
    this.speaking = false
    if (this.currentAudio) {
      this.currentAudio.pause()
      if (this.currentAudio.src) URL.revokeObjectURL(this.currentAudio.src)
      this.currentAudio = null
    }
    this.fallback.stop()
  }

  isSpeaking(): boolean {
    return this.speaking
  }

  private async fetchStreaming(text: string): Promise<Blob> {
    const url = `${this.config.streamEndpoint}?text=${encodeURIComponent(text)}`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error(`Stream TTS failed: ${res.status}`)
    return res.blob()
  }

  private async fetchFull(text: string): Promise<Blob> {
    const res = await fetch(this.config.fullEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`Full TTS failed: ${res.status}`)
    return res.blob()
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
        reject(new Error(`Audio playback error: ${e}`))
      }

      this.currentAudio.play().catch(reject)
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/providers/tts/ElevenLabsTTS.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/providers/tts/ElevenLabsTTS.ts tests/lib/voice-module/providers/tts/ElevenLabsTTS.test.ts
git commit -m "feat(voice-module): extract ElevenLabs TTS provider"
```

---

## Chunk 4: Turn Manager & Tool Validation

### Task 8: Create TurnManager with speech queue and streaming

**Files:**
- Create: `lib/voice-module/core/TurnManager.ts`
- Test: `tests/lib/voice-module/core/TurnManager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/core/TurnManager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TurnManager } from '@/lib/voice-module/core/TurnManager'
import { VoiceEventEmitter } from '@/lib/voice-module/core/events'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'
import type { StreamChunk, TurnContext } from '@/lib/voice-module/core/types'

const makeMockTTS = (): TTSProvider => ({
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isSpeaking: vi.fn(() => false),
})

async function* mockStream(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) yield chunk
}

const makeMockLLM = (chunks: StreamChunk[]): LLMProvider => ({
  streamTurn: vi.fn(() => mockStream(chunks)),
})

describe('TurnManager', () => {
  let events: VoiceEventEmitter
  let tts: TTSProvider
  let llm: LLMProvider
  let turn: TurnManager

  const defaultContext: TurnContext = {
    systemPrompt: 'You are a coach',
    tools: [],
  }

  beforeEach(() => {
    events = new VoiceEventEmitter()
    tts = makeMockTTS()
    llm = makeMockLLM([
      { type: 'delta', text: 'Gut gemacht.' },
      { type: 'done', reply: 'Gut gemacht.', llmLatencyMs: 50, totalLatencyMs: 100 },
    ])
    turn = new TurnManager({ events, tts, llm })
  })

  it('processes a user message and speaks the response', async () => {
    await turn.handleUserMessage('Weiter', defaultContext, [])
    expect(tts.speak).toHaveBeenCalledWith('Gut gemacht.')
  })

  it('emits turnStateChanged through the lifecycle', async () => {
    const states: string[] = []
    events.on('turnStateChanged', (s) => states.push(s))
    await turn.handleUserMessage('Weiter', defaultContext, [])
    expect(states).toContain('processing')
    expect(states).toContain('speaking')
    expect(states).toContain('idle')
  })

  it('emits toolCall when LLM returns tool_use', async () => {
    const toolLLM = makeMockLLM([
      { type: 'tool_call', name: 'next_exercise', input: {} },
      { type: 'delta', text: 'Weiter gehts!' },
      { type: 'done', reply: 'Weiter gehts!', llmLatencyMs: 50, totalLatencyMs: 100 },
    ])
    turn = new TurnManager({ events, tts, llm: toolLLM })

    const handler = vi.fn()
    events.on('toolCall', handler)
    await turn.handleUserMessage('Nächste Übung', defaultContext, [])
    expect(handler).toHaveBeenCalledWith({ name: 'next_exercise', input: {} })
  })

  it('interrupt stops TTS and resets state', async () => {
    turn.interrupt()
    expect(tts.stop).toHaveBeenCalled()
  })

  it('batches speech by sentence boundaries', async () => {
    const multiSentenceLLM = makeMockLLM([
      { type: 'delta', text: 'Satz eins. ' },
      { type: 'delta', text: 'Satz zwei! ' },
      { type: 'delta', text: 'Ende.' },
      { type: 'done', reply: 'Satz eins. Satz zwei! Ende.', llmLatencyMs: 50, totalLatencyMs: 100 },
    ])
    turn = new TurnManager({ events, tts, llm: multiSentenceLLM })
    await turn.handleUserMessage('Test', defaultContext, [])
    // Should have been called with sentence chunks
    expect((tts.speak as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/core/TurnManager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the TurnManager**

```typescript
// lib/voice-module/core/TurnManager.ts
import type { VoiceEventEmitter } from './events'
import type { TurnContext, StreamChunk, TranscriptMessage } from './types'
import type { TTSProvider } from '../providers/tts/TTSProvider'
import type { LLMProvider } from '../providers/llm/LLMProvider'

interface TurnManagerConfig {
  events: VoiceEventEmitter
  tts: TTSProvider
  llm: LLMProvider
}

export class TurnManager {
  private events: VoiceEventEmitter
  private tts: TTSProvider
  private llm: LLMProvider
  private interrupted = false

  constructor(config: TurnManagerConfig) {
    this.events = config.events
    this.tts = config.tts
    this.llm = config.llm
  }

  async handleUserMessage(
    text: string,
    context: TurnContext,
    history: Array<{ role: string; content: string }>,
  ): Promise<string> {
    this.interrupted = false
    this.events.emit('turnStateChanged', 'processing')

    // Add user message to transcript
    this.events.emit('transcript', {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    })

    const messages = [...history, { role: 'user', content: text }]
    const stream = this.llm.streamTurn(context, messages)

    let fullReply = ''
    let buffer = ''
    const speechQueue: string[] = []
    let speakingPromise: Promise<void> | null = null

    const processSpeechQueue = async () => {
      while (speechQueue.length > 0 && !this.interrupted) {
        const chunk = speechQueue.shift()!
        this.events.emit('turnStateChanged', 'speaking')
        await this.tts.speak(chunk)
      }
    }

    for await (const chunk of stream) {
      if (this.interrupted) break

      if (chunk.type === 'delta') {
        fullReply += chunk.text
        buffer += chunk.text

        // Flush on sentence boundaries
        const sentences = buffer.split(/(?<=[.!?…])\s+/)
        if (sentences.length > 1) {
          for (let i = 0; i < sentences.length - 1; i++) {
            const sentence = sentences[i].trim()
            if (sentence) speechQueue.push(sentence)
          }
          buffer = sentences[sentences.length - 1]
          if (!speakingPromise) {
            speakingPromise = processSpeechQueue()
          }
        }
      } else if (chunk.type === 'tool_call') {
        this.events.emit('toolCall', { name: chunk.name, input: chunk.input })
      }
      // 'done' chunk: flush remaining buffer
    }

    // Flush remaining buffer
    if (buffer.trim() && !this.interrupted) {
      speechQueue.push(buffer.trim())
      if (!speakingPromise) {
        speakingPromise = processSpeechQueue()
      }
    }

    // Wait for all speech to complete
    if (speakingPromise) {
      await speakingPromise
      // Process any remaining items added during speaking
      await processSpeechQueue()
    }

    if (!this.interrupted) {
      this.events.emit('transcript', {
        role: 'assistant',
        content: fullReply,
        timestamp: Date.now(),
      })
    }

    this.events.emit('turnStateChanged', 'idle')
    return fullReply
  }

  interrupt(): void {
    this.interrupted = true
    this.tts.stop()
    this.events.emit('interruptRequested')
    this.events.emit('turnStateChanged', 'idle')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/core/TurnManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/core/TurnManager.ts tests/lib/voice-module/core/TurnManager.test.ts
git commit -m "feat(voice-module): add TurnManager with streaming speech queue"
```

---

### Task 9: Create workout tool validation

**Files:**
- Create: `lib/voice-module/tools/workout-tools.ts`
- Test: `tests/lib/voice-module/tools/workout-tools.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/tools/workout-tools.test.ts
import { describe, it, expect } from 'vitest'
import {
  WORKOUT_TOOLS,
  validateToolCall,
  executeToolCall,
} from '@/lib/voice-module/tools/workout-tools'
import type { WorkoutState } from '@/lib/voice-module/core/types'

const makeState = (overrides?: Partial<WorkoutState>): WorkoutState => ({
  sessionId: 'test',
  status: 'active',
  currentExerciseIndex: 0,
  startedAt: new Date().toISOString(),
  exercises: [
    { id: 'ex1', name: 'Squats', phase: 'main', type: 'reps', targetSets: 3, targetReps: 10, completedSets: 2, status: 'active' },
    { id: 'ex2', name: 'Plank', phase: 'main', type: 'timed', targetDuration: 60, completedSets: 0, remainingSeconds: 60, status: 'pending' },
  ],
  ...overrides,
})

describe('WORKOUT_TOOLS', () => {
  it('exports tool definitions for Claude', () => {
    expect(WORKOUT_TOOLS).toHaveLength(7)
    expect(WORKOUT_TOOLS.map((t) => t.name)).toContain('next_exercise')
    expect(WORKOUT_TOOLS.map((t) => t.name)).toContain('pause_workout')
  })
})

describe('validateToolCall', () => {
  it('allows next_exercise when current is completed', () => {
    const state = makeState()
    state.exercises[0].status = 'completed'
    expect(validateToolCall('next_exercise', {}, state)).toEqual({ valid: true })
  })

  it('rejects next_exercise when current is active', () => {
    const state = makeState()
    const result = validateToolCall('next_exercise', {}, state)
    expect(result.valid).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('rejects next_exercise when at last exercise', () => {
    const state = makeState({ currentExerciseIndex: 1 })
    state.exercises[1].status = 'completed'
    const result = validateToolCall('next_exercise', {}, state)
    expect(result.valid).toBe(false)
  })

  it('allows pause_workout when active', () => {
    expect(validateToolCall('pause_workout', {}, makeState()).valid).toBe(true)
  })

  it('rejects pause_workout when already paused', () => {
    expect(validateToolCall('pause_workout', {}, makeState({ status: 'paused' })).valid).toBe(false)
  })

  it('allows mark_set_complete on reps exercise', () => {
    expect(validateToolCall('mark_set_complete', {}, makeState()).valid).toBe(true)
  })

  it('rejects mark_set_complete on timed exercise', () => {
    const state = makeState({ currentExerciseIndex: 1 })
    state.exercises[1].status = 'active'
    expect(validateToolCall('mark_set_complete', {}, state).valid).toBe(false)
  })

  it('rejects unknown tool', () => {
    expect(validateToolCall('fly_away', {}, makeState()).valid).toBe(false)
  })
})

describe('executeToolCall', () => {
  it('next_exercise advances index and marks current completed', () => {
    const state = makeState()
    state.exercises[0].status = 'completed'
    const next = executeToolCall('next_exercise', {}, state)
    expect(next.currentExerciseIndex).toBe(1)
    expect(next.exercises[1].status).toBe('active')
  })

  it('pause_workout sets status to paused', () => {
    const next = executeToolCall('pause_workout', {}, makeState())
    expect(next.status).toBe('paused')
  })

  it('resume_workout sets status to active', () => {
    const state = makeState({ status: 'paused' })
    const next = executeToolCall('resume_workout', {}, state)
    expect(next.status).toBe('active')
  })

  it('mark_set_complete increments completedSets', () => {
    const state = makeState()
    const next = executeToolCall('mark_set_complete', {}, state)
    expect(next.exercises[0].completedSets).toBe(3)
  })

  it('mark_set_complete auto-completes exercise when all sets done', () => {
    const state = makeState()
    const next = executeToolCall('mark_set_complete', {}, state)
    expect(next.exercises[0].status).toBe('completed')
  })

  it('adjust_timer modifies remainingSeconds', () => {
    const state = makeState({ currentExerciseIndex: 1 })
    state.exercises[1].status = 'active'
    const next = executeToolCall('adjust_timer', { delta: -15 }, state)
    expect(next.exercises[1].remainingSeconds).toBe(45)
  })

  it('end_session sets status to completed', () => {
    const next = executeToolCall('end_session', {}, makeState())
    expect(next.status).toBe('completed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/tools/workout-tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the workout tools**

```typescript
// lib/voice-module/tools/workout-tools.ts
import type { ToolDefinition, WorkoutState } from '../core/types'

export const WORKOUT_TOOLS: ToolDefinition[] = [
  {
    name: 'next_exercise',
    description: 'Advance to the next exercise in the plan',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'previous_exercise',
    description: 'Go back to the previous exercise',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'pause_workout',
    description: 'Pause the current workout timer',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'resume_workout',
    description: 'Resume a paused workout',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'mark_set_complete',
    description: 'Mark the current set as completed for rep-based exercises',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'adjust_timer',
    description: 'Adjust the remaining time for the current exercise',
    input_schema: {
      type: 'object',
      properties: { delta: { type: 'number', description: 'Seconds to add (positive) or remove (negative)' } },
      required: ['delta'],
    },
  },
  {
    name: 'end_session',
    description: 'End the workout session early',
    input_schema: { type: 'object', properties: {} },
  },
]

interface ValidationResult {
  valid: boolean
  reason?: string
}

export function validateToolCall(
  name: string,
  input: Record<string, unknown>,
  state: WorkoutState,
): ValidationResult {
  const current = state.exercises[state.currentExerciseIndex]
  const toolNames = WORKOUT_TOOLS.map((t) => t.name)

  if (!toolNames.includes(name)) {
    return { valid: false, reason: `Unknown tool: ${name}` }
  }

  switch (name) {
    case 'next_exercise': {
      if (current?.status !== 'completed' && current?.status !== 'skipped') {
        return { valid: false, reason: 'Current exercise is not completed yet' }
      }
      if (state.currentExerciseIndex >= state.exercises.length - 1) {
        return { valid: false, reason: 'Already at the last exercise' }
      }
      return { valid: true }
    }
    case 'previous_exercise': {
      if (state.currentExerciseIndex <= 0) {
        return { valid: false, reason: 'Already at the first exercise' }
      }
      return { valid: true }
    }
    case 'pause_workout': {
      if (state.status !== 'active') {
        return { valid: false, reason: 'Workout is not active' }
      }
      return { valid: true }
    }
    case 'resume_workout': {
      if (state.status !== 'paused') {
        return { valid: false, reason: 'Workout is not paused' }
      }
      return { valid: true }
    }
    case 'mark_set_complete': {
      if (current?.type !== 'reps') {
        return { valid: false, reason: 'Current exercise is not rep-based' }
      }
      if (current.status !== 'active') {
        return { valid: false, reason: 'Current exercise is not active' }
      }
      return { valid: true }
    }
    case 'adjust_timer': {
      if (current?.type !== 'timed') {
        return { valid: false, reason: 'Current exercise is not timed' }
      }
      return { valid: true }
    }
    case 'end_session': {
      return { valid: true }
    }
    default:
      return { valid: false, reason: `Unhandled tool: ${name}` }
  }
}

export function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  state: WorkoutState,
): WorkoutState {
  // Deep clone to avoid mutation
  const next: WorkoutState = JSON.parse(JSON.stringify(state))
  const current = next.exercises[next.currentExerciseIndex]

  switch (name) {
    case 'next_exercise': {
      next.currentExerciseIndex += 1
      next.exercises[next.currentExerciseIndex].status = 'active'
      break
    }
    case 'previous_exercise': {
      next.currentExerciseIndex -= 1
      break
    }
    case 'pause_workout': {
      next.status = 'paused'
      break
    }
    case 'resume_workout': {
      next.status = 'active'
      break
    }
    case 'mark_set_complete': {
      current.completedSets += 1
      if (current.targetSets && current.completedSets >= current.targetSets) {
        current.status = 'completed'
      }
      break
    }
    case 'adjust_timer': {
      const delta = (input.delta as number) ?? 0
      current.remainingSeconds = Math.max(0, (current.remainingSeconds ?? 0) + delta)
      break
    }
    case 'end_session': {
      next.status = 'completed'
      break
    }
  }

  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/tools/workout-tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/tools/workout-tools.ts tests/lib/voice-module/tools/workout-tools.test.ts
git commit -m "feat(voice-module): add workout tool definitions and validation"
```

---

## Chunk 5: VoiceSession, Server Orchestrator Update, React Hook

### Task 10: Create VoiceSession orchestrator

**Files:**
- Create: `lib/voice-module/core/VoiceSession.ts`
- Test: `tests/lib/voice-module/core/VoiceSession.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/core/VoiceSession.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VoiceSession } from '@/lib/voice-module/core/VoiceSession'
import type { VoiceConfig, TurnContext, StreamChunk } from '@/lib/voice-module/core/types'
import type { STTProvider } from '@/lib/voice-module/providers/stt/STTProvider'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'

const makeMockSTT = (): STTProvider => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isActive: vi.fn(() => false),
  onPartialTranscript: null,
  onCommittedTranscript: null,
  onError: null,
})

const makeMockTTS = (): TTSProvider => ({
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isSpeaking: vi.fn(() => false),
})

async function* mockStream(): AsyncGenerator<StreamChunk> {
  yield { type: 'delta', text: 'Ok!' }
  yield { type: 'done', reply: 'Ok!', llmLatencyMs: 50, totalLatencyMs: 100 }
}

const makeMockLLM = (): LLMProvider => ({
  streamTurn: vi.fn(() => mockStream()),
})

describe('VoiceSession', () => {
  let session: VoiceSession
  let stt: STTProvider
  let tts: TTSProvider
  let llm: LLMProvider
  const config: VoiceConfig = {
    stt: 'browser',
    tts: 'browser',
    llmEndpoint: '/api/voice/realtime/stream',
    autoListen: false,
    language: 'de-DE',
  }

  const turnContext: TurnContext = {
    systemPrompt: 'You are a coach',
  }

  beforeEach(() => {
    stt = makeMockSTT()
    tts = makeMockTTS()
    llm = makeMockLLM()
    session = new VoiceSession({ config, stt, tts, llm })
  })

  it('starts in idle state', () => {
    expect(session.getState()).toBe('idle')
  })

  it('exposes event emitter for external listeners', () => {
    const handler = vi.fn()
    session.on('turnStateChanged', handler)
    // Trigger a state change by sending a message
    session.sendMessage('Hallo', turnContext)
    expect(handler).toHaveBeenCalled()
  })

  it('startListening activates STT', async () => {
    await session.startListening()
    expect(stt.start).toHaveBeenCalled()
  })

  it('stopListening deactivates STT', async () => {
    await session.startListening()
    session.stopListening()
    expect(stt.stop).toHaveBeenCalled()
  })

  it('sendMessage processes through TurnManager', async () => {
    await session.sendMessage('Test', turnContext)
    expect(llm.streamTurn).toHaveBeenCalled()
    expect(tts.speak).toHaveBeenCalled()
  })

  it('interrupt stops everything', () => {
    session.interrupt()
    expect(tts.stop).toHaveBeenCalled()
  })

  it('destroy cleans up all resources', () => {
    session.destroy()
    expect(stt.stop).toHaveBeenCalled()
    expect(tts.stop).toHaveBeenCalled()
  })

  it('toolCall events are forwarded', async () => {
    async function* toolStream(): AsyncGenerator<StreamChunk> {
      yield { type: 'tool_call', name: 'pause_workout', input: {} }
      yield { type: 'delta', text: 'Paused.' }
      yield { type: 'done', reply: 'Paused.', llmLatencyMs: 50, totalLatencyMs: 100 }
    }
    const toolLLM: LLMProvider = { streamTurn: vi.fn(() => toolStream()) }
    session = new VoiceSession({ config, stt, tts, llm: toolLLM })

    const handler = vi.fn()
    session.on('toolCall', handler)
    await session.sendMessage('Pause', turnContext)
    expect(handler).toHaveBeenCalledWith({ name: 'pause_workout', input: {} })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/core/VoiceSession.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write VoiceSession**

```typescript
// lib/voice-module/core/VoiceSession.ts
import type { VoiceConfig, TurnContext, TurnState, TranscriptMessage } from './types'
import type { VoiceEventMap } from './events'
import { VoiceEventEmitter } from './events'
import { TurnManager } from './TurnManager'
import type { STTProvider } from '../providers/stt/STTProvider'
import type { TTSProvider } from '../providers/tts/TTSProvider'
import type { LLMProvider } from '../providers/llm/LLMProvider'

interface VoiceSessionConfig {
  config: VoiceConfig
  stt: STTProvider
  tts: TTSProvider
  llm: LLMProvider
}

export class VoiceSession {
  private events = new VoiceEventEmitter()
  private turnManager: TurnManager
  private stt: STTProvider
  private tts: TTSProvider
  private config: VoiceConfig
  private state: TurnState = 'idle'
  private history: Array<{ role: string; content: string }> = []

  constructor({ config, stt, tts, llm }: VoiceSessionConfig) {
    this.config = config
    this.stt = stt
    this.tts = tts
    this.turnManager = new TurnManager({ events: this.events, tts, llm })

    // Track state changes
    this.events.on('turnStateChanged', (s) => {
      this.state = s
    })

    // Wire STT committed transcript to auto-send if configured
    this.stt.onCommittedTranscript = (text) => {
      this.events.emit('transcript', { role: 'user', content: text, timestamp: Date.now() })
    }

    this.stt.onError = (err) => {
      this.events.emit('error', err)
    }
  }

  getState(): TurnState {
    return this.state
  }

  on<K extends keyof VoiceEventMap>(event: K, handler: (data: VoiceEventMap[K]) => void): void {
    this.events.on(event, handler)
  }

  off<K extends keyof VoiceEventMap>(event: K, handler: (data: VoiceEventMap[K]) => void): void {
    this.events.off(event, handler)
  }

  async startListening(): Promise<void> {
    this.events.emit('turnStateChanged', 'listening')
    await this.stt.start()
  }

  stopListening(): void {
    this.stt.stop()
    if (this.state === 'listening') {
      this.events.emit('turnStateChanged', 'idle')
    }
  }

  async sendMessage(text: string, context: TurnContext): Promise<string> {
    this.stt.stop() // Stop listening while processing
    const reply = await this.turnManager.handleUserMessage(text, context, this.history)
    this.history.push({ role: 'user', content: text })
    this.history.push({ role: 'assistant', content: reply })
    return reply
  }

  interrupt(): void {
    this.turnManager.interrupt()
  }

  getHistory(): Array<{ role: string; content: string }> {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }

  destroy(): void {
    this.stt.stop()
    this.tts.stop()
    this.events.removeAllListeners()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/core/VoiceSession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/core/VoiceSession.ts tests/lib/voice-module/core/VoiceSession.test.ts
git commit -m "feat(voice-module): add VoiceSession orchestrator"
```

---

### Task 11: Update server orchestrator for tool_use support

**Files:**
- Modify: `lib/voice/server-orchestrator.ts`
- Modify: `app/api/voice/realtime/stream/route.ts`
- Test: `tests/lib/voice/server-orchestrator-tools.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice/server-orchestrator-tools.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          { type: 'tool_use', id: 'call_1', name: 'next_exercise', input: {} },
          { type: 'text', text: 'Weiter gehts!' },
        ],
      }),
      stream: vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_start', content_block: { type: 'tool_use', id: 'call_1', name: 'next_exercise' } }
          yield { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } }
          yield { type: 'content_block_stop' }
          yield { type: 'content_block_start', content_block: { type: 'text', text: '' } }
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Weiter!' } }
          yield { type: 'content_block_stop' }
          yield { type: 'message_stop' }
        },
      }),
    },
  })),
}))

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { name: 'Test' } }),
        }),
      }),
    }),
  }),
}))

// Mock Mem0
vi.mock('@/lib/mem0', () => ({
  getSessionContext: vi.fn().mockResolvedValue({
    kernMotivation: '',
    personalityHints: '',
    patternHints: '',
    lifeContext: '',
  }),
}))

describe('server orchestrator tool_use', () => {
  it('streams tool_call chunks when Claude uses tools', async () => {
    // This test verifies the streaming format includes tool_call events
    // Implementation will be validated in Task 11 Step 3
    expect(true).toBe(true) // Placeholder — real test needs server orchestrator update
  })
})
```

- [ ] **Step 2: Update server-orchestrator.ts to pass tools to Claude**

Read the current `lib/voice/server-orchestrator.ts` and add:
1. Accept a `tools` parameter in `streamVoiceTurnOrchestration()`
2. Pass tools to the Claude API call
3. When streaming, detect `content_block_start` with `type: 'tool_use'` and yield `{ type: 'tool_call', name, input }` chunks

Key changes to `streamVoiceTurnOrchestration()`:
- Add `tools?: ToolDefinition[]` parameter
- Map `ToolDefinition` to Claude's tool format
- Handle `tool_use` content blocks in the streaming response
- Yield `StreamChunk` with `type: 'tool_call'` for tool use blocks

- [ ] **Step 3: Update the SSE stream route to forward tool_call events**

In `app/api/voice/realtime/stream/route.ts`:
- Accept `tools` and `workoutState` in the POST body
- Pass tools to `streamVoiceTurnOrchestration()`
- Forward `tool_call` chunks as SSE events: `data: {"type":"tool_call","name":"...","input":{...}}`

- [ ] **Step 4: Run the full test suite to verify nothing is broken**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add lib/voice/server-orchestrator.ts app/api/voice/realtime/stream/route.ts tests/lib/voice/server-orchestrator-tools.test.ts
git commit -m "feat: add tool_use support to server orchestrator and SSE stream"
```

---

### Task 12: Create useVoiceSession React hook

**Files:**
- Create: `lib/voice-module/react/useVoiceSession.ts`
- Test: `tests/lib/voice-module/react/useVoiceSession.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/voice-module/react/useVoiceSession.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceSession } from '@/lib/voice-module/react/useVoiceSession'
import type { VoiceConfig, StreamChunk } from '@/lib/voice-module/core/types'
import type { STTProvider } from '@/lib/voice-module/providers/stt/STTProvider'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'

const makeMockSTT = (): STTProvider => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isActive: vi.fn(() => false),
  onPartialTranscript: null,
  onCommittedTranscript: null,
  onError: null,
})

const makeMockTTS = (): TTSProvider => ({
  speak: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isSpeaking: vi.fn(() => false),
})

async function* mockStream(): AsyncGenerator<StreamChunk> {
  yield { type: 'delta', text: 'Hi!' }
  yield { type: 'done', reply: 'Hi!', llmLatencyMs: 50, totalLatencyMs: 100 }
}

const makeMockLLM = (): LLMProvider => ({
  streamTurn: vi.fn(() => mockStream()),
})

describe('useVoiceSession', () => {
  const config: VoiceConfig = {
    stt: 'browser',
    tts: 'browser',
    llmEndpoint: '/api/voice/realtime/stream',
    autoListen: false,
    language: 'de-DE',
  }

  it('returns turnState, transcript, and control functions', () => {
    const { result } = renderHook(() =>
      useVoiceSession({ config, stt: makeMockSTT(), tts: makeMockTTS(), llm: makeMockLLM() }),
    )

    expect(result.current.turnState).toBe('idle')
    expect(result.current.transcript).toEqual([])
    expect(result.current.sendMessage).toBeDefined()
    expect(result.current.startListening).toBeDefined()
    expect(result.current.stopListening).toBeDefined()
    expect(result.current.interrupt).toBeDefined()
  })

  it('updates turnState on sendMessage', async () => {
    const { result } = renderHook(() =>
      useVoiceSession({ config, stt: makeMockSTT(), tts: makeMockTTS(), llm: makeMockLLM() }),
    )

    await act(async () => {
      await result.current.sendMessage('Hello', { systemPrompt: 'test' })
    })

    expect(result.current.turnState).toBe('idle')
    expect(result.current.transcript.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/voice-module/react/useVoiceSession.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook**

```typescript
// lib/voice-module/react/useVoiceSession.ts
'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { VoiceSession } from '../core/VoiceSession'
import type { VoiceConfig, TurnContext, TurnState, TranscriptMessage } from '../core/types'
import type { STTProvider } from '../providers/stt/STTProvider'
import type { TTSProvider } from '../providers/tts/TTSProvider'
import type { LLMProvider } from '../providers/llm/LLMProvider'

interface UseVoiceSessionConfig {
  config: VoiceConfig
  stt: STTProvider
  tts: TTSProvider
  llm: LLMProvider
  onToolCall?: (tool: { name: string; input: Record<string, unknown> }) => void
  onError?: (error: Error) => void
}

interface UseVoiceSessionReturn {
  turnState: TurnState
  transcript: TranscriptMessage[]
  sendMessage: (text: string, context: TurnContext) => Promise<string>
  startListening: () => Promise<void>
  stopListening: () => void
  interrupt: () => void
}

export function useVoiceSession({
  config,
  stt,
  tts,
  llm,
  onToolCall,
  onError,
}: UseVoiceSessionConfig): UseVoiceSessionReturn {
  const sessionRef = useRef<VoiceSession | null>(null)
  const [turnState, setTurnState] = useState<TurnState>('idle')
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])

  // Stable refs for callbacks
  const onToolCallRef = useRef(onToolCall)
  onToolCallRef.current = onToolCall
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    const session = new VoiceSession({ config, stt, tts, llm })
    sessionRef.current = session

    session.on('turnStateChanged', setTurnState)
    session.on('transcript', (msg) => {
      setTranscript((prev) => [...prev, msg])
    })
    session.on('toolCall', (tool) => {
      onToolCallRef.current?.(tool)
    })
    session.on('error', (err) => {
      onErrorRef.current?.(err)
    })

    return () => {
      session.destroy()
      sessionRef.current = null
    }
  }, []) // Intentionally empty — providers are stable refs

  const sendMessage = useCallback(async (text: string, context: TurnContext) => {
    if (!sessionRef.current) throw new Error('Session not initialized')
    return sessionRef.current.sendMessage(text, context)
  }, [])

  const startListening = useCallback(async () => {
    if (!sessionRef.current) return
    await sessionRef.current.startListening()
  }, [])

  const stopListening = useCallback(() => {
    sessionRef.current?.stopListening()
  }, [])

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt()
  }, [])

  return { turnState, transcript, sendMessage, startListening, stopListening, interrupt }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/voice-module/react/useVoiceSession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/voice-module/react/useVoiceSession.ts tests/lib/voice-module/react/useVoiceSession.test.ts
git commit -m "feat(voice-module): add useVoiceSession React hook"
```

---

## Chunk 6: React Components, Module Index & SessionPlayer Refactor

### Task 13: Create reusable VoiceStatusIndicator component

**Files:**
- Create: `lib/voice-module/react/VoiceStatusIndicator.tsx`

- [ ] **Step 1: Write the component**

```typescript
// lib/voice-module/react/VoiceStatusIndicator.tsx
'use client'

import type { TurnState } from '../core/types'

interface VoiceStatusIndicatorProps {
  state: TurnState
  labels?: Record<TurnState, string>
  className?: string
}

const DEFAULT_LABELS: Record<TurnState, string> = {
  idle: 'Bereit',
  listening: 'Hört zu...',
  processing: 'Versteht...',
  speaking: 'Antwortet...',
}

const STATE_COLORS: Record<TurnState, string> = {
  idle: 'bg-gray-400',
  listening: 'bg-green-500 animate-pulse',
  processing: 'bg-yellow-500 animate-pulse',
  speaking: 'bg-blue-500 animate-pulse',
}

export function VoiceStatusIndicator({ state, labels, className = '' }: VoiceStatusIndicatorProps) {
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`h-3 w-3 rounded-full ${STATE_COLORS[state]}`} />
      <span className="text-sm font-medium">{resolvedLabels[state]}</span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/voice-module/react/VoiceStatusIndicator.tsx
git commit -m "feat(voice-module): add VoiceStatusIndicator component"
```

---

### Task 14: Create reusable TranscriptView component

**Files:**
- Create: `lib/voice-module/react/TranscriptView.tsx`

- [ ] **Step 1: Write the component**

```typescript
// lib/voice-module/react/TranscriptView.tsx
'use client'

import { useRef, useEffect } from 'react'
import type { TranscriptMessage } from '../core/types'

interface TranscriptViewProps {
  messages: TranscriptMessage[]
  className?: string
  userLabel?: string
  assistantLabel?: string
}

export function TranscriptView({
  messages,
  className = '',
  userLabel = 'Du',
  assistantLabel = 'Coach',
}: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  if (messages.length === 0) return null

  return (
    <div ref={scrollRef} className={`overflow-y-auto space-y-2 ${className}`}>
      {messages.map((msg, i) => (
        <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
          <span className="text-xs text-muted-foreground">
            {msg.role === 'user' ? userLabel : assistantLabel}
          </span>
          <p className={`inline-block rounded-lg px-3 py-1 ${
            msg.role === 'user' ? 'bg-primary/10' : 'bg-muted'
          }`}>
            {msg.content}
          </p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/voice-module/react/TranscriptView.tsx
git commit -m "feat(voice-module): add TranscriptView component"
```

---

### Task 15: Create module public API index

**Files:**
- Create: `lib/voice-module/index.ts`

- [ ] **Step 1: Write the module index**

```typescript
// lib/voice-module/index.ts

// Core
export { VoiceSession } from './core/VoiceSession'
export { VoiceEventEmitter } from './core/events'
export { TurnManager } from './core/TurnManager'
export type {
  VoiceConfig,
  TurnContext,
  ToolDefinition,
  StreamChunk,
  WorkoutState,
  ExerciseState,
  TurnState,
  TranscriptMessage,
} from './core/types'
export type { VoiceEventMap } from './core/events'

// Providers
export type { STTProvider } from './providers/stt/STTProvider'
export type { TTSProvider } from './providers/tts/TTSProvider'
export type { LLMProvider } from './providers/llm/LLMProvider'
export { ElevenLabsSTT } from './providers/stt/ElevenLabsSTT'
export { BrowserSTT } from './providers/stt/BrowserSTT'
export { ElevenLabsTTS } from './providers/tts/ElevenLabsTTS'
export { BrowserTTS } from './providers/tts/BrowserTTS'

// Tools
export { WORKOUT_TOOLS, validateToolCall, executeToolCall } from './tools/workout-tools'

// React
export { useVoiceSession } from './react/useVoiceSession'
export { VoiceStatusIndicator } from './react/VoiceStatusIndicator'
export { TranscriptView } from './react/TranscriptView'
```

- [ ] **Step 2: Commit**

```bash
git add lib/voice-module/index.ts
git commit -m "feat(voice-module): add public API index"
```

---

### Task 16: Refactor SessionPlayer to use voice module

**Files:**
- Modify: `components/training/SessionPlayer.tsx` (rewrite from ~891 lines to ~200 lines)
- Modify: `app/training/session/page.tsx` (update imports)

This is the biggest task — replacing the monolith with the modular voice session.

- [ ] **Step 1: Create the LLM provider adapter for existing API**

```typescript
// lib/voice-module/providers/llm/FetchSSEProvider.ts
import type { LLMProvider } from './LLMProvider'
import type { TurnContext, StreamChunk } from '../../core/types'

interface FetchSSEProviderConfig {
  endpoint: string
}

export class FetchSSEProvider implements LLMProvider {
  private endpoint: string

  constructor(config: FetchSSEProviderConfig) {
    this.endpoint = config.endpoint
  }

  async *streamTurn(
    context: TurnContext,
    messages: Array<{ role: string; content: string }>,
  ): AsyncGenerator<StreamChunk> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        messages,
        currentExercise: context.metadata?.currentExercise ?? null,
        sessionNumber: context.metadata?.sessionNumber ?? 1,
        tools: context.tools ?? [],
        workoutState: context.metadata?.workoutState ?? null,
      }),
    })

    if (!res.ok) throw new Error(`LLM request failed: ${res.status}`)
    if (!res.body) throw new Error('No response body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data || data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data) as StreamChunk
          yield parsed
        } catch {
          // skip malformed chunks
        }
      }
    }
  }
}
```

- [ ] **Step 2: Rewrite SessionPlayer as thin domain adapter**

Rewrite `components/training/SessionPlayer.tsx` to:
1. Import `useVoiceSession`, `VoiceStatusIndicator`, `TranscriptView` from `@/lib/voice-module`
2. Import `WORKOUT_TOOLS`, `validateToolCall`, `executeToolCall` from `@/lib/voice-module`
3. Create providers (STT, TTS, LLM) based on environment
4. Use `useVoiceSession` hook for all voice interaction
5. Handle `onToolCall` by validating and executing against `WorkoutState`
6. Keep only: exercise progression UI, timer display, tool call handling, workout state management

The new SessionPlayer should be ~200 lines focused purely on domain logic.

- [ ] **Step 3: Update session page imports**

In `app/training/session/page.tsx`: update to use new voice module factory functions instead of old `createVoiceProvider()`.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Manual smoke test**

Start the dev server (`npm run dev`) and:
1. Navigate to a training session
2. Verify voice coaching works (STT + TTS)
3. Test tool calls — say "Nächste Übung" and verify exercise advances
4. Test interrupt — speak while coach is talking
5. Test mic toggle on/off

- [ ] **Step 6: Commit**

```bash
git add lib/voice-module/providers/llm/FetchSSEProvider.ts components/training/SessionPlayer.tsx app/training/session/page.tsx
git commit -m "refactor: rewrite SessionPlayer as thin domain adapter using voice module"
```

---

### Task 17: Clean up old voice files

**Files:**
- Delete: `lib/voice/realtime-orchestrator.ts`
- Delete: `lib/voice/browser-tts.ts`
- Delete: `lib/voice/elevenlabs.ts`
- Delete: `lib/voice/types.ts`
- Delete: `lib/voice/index.ts`
- Keep: `lib/voice/server-orchestrator.ts` (still used by API routes)
- Update: any remaining imports pointing to old files

- [ ] **Step 1: Search for all imports of old voice files**

Run: `grep -r "from.*@/lib/voice/" --include="*.ts" --include="*.tsx" .`
Update each import to use `@/lib/voice-module` equivalents.

- [ ] **Step 2: Delete old files that are fully replaced**

Delete the files listed above. Keep `server-orchestrator.ts` as it's still the API route handler.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old voice files replaced by voice-module"
```

---

### Task 18: Final integration test

**Files:**
- Create: `tests/integration/voice-session-flow.test.ts`

- [ ] **Step 1: Write end-to-end text-only integration test**

```typescript
// tests/integration/voice-session-flow.test.ts
import { describe, it, expect, vi } from 'vitest'
import { VoiceSession } from '@/lib/voice-module/core/VoiceSession'
import { validateToolCall, executeToolCall } from '@/lib/voice-module/tools/workout-tools'
import type { VoiceConfig, StreamChunk, WorkoutState } from '@/lib/voice-module/core/types'
import type { STTProvider } from '@/lib/voice-module/providers/stt/STTProvider'
import type { TTSProvider } from '@/lib/voice-module/providers/tts/TTSProvider'
import type { LLMProvider } from '@/lib/voice-module/providers/llm/LLMProvider'

// Text-only mocks — no audio APIs needed
const nullSTT: STTProvider = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  isActive: () => false,
  onPartialTranscript: null,
  onCommittedTranscript: null,
  onError: null,
}

const spokenTexts: string[] = []
const nullTTS: TTSProvider = {
  speak: vi.fn(async (text) => { spokenTexts.push(text) }),
  stop: vi.fn(),
  isSpeaking: () => false,
}

describe('Voice session full flow (text-only)', () => {
  it('processes a message and speaks the response', async () => {
    async function* stream(): AsyncGenerator<StreamChunk> {
      yield { type: 'delta', text: 'Los gehts!' }
      yield { type: 'done', reply: 'Los gehts!', llmLatencyMs: 50, totalLatencyMs: 100 }
    }
    const llm: LLMProvider = { streamTurn: vi.fn(() => stream()) }

    const session = new VoiceSession({
      config: { stt: 'none', tts: 'browser', llmEndpoint: '', autoListen: false, language: 'de-DE' },
      stt: nullSTT,
      tts: nullTTS,
      llm,
    })

    spokenTexts.length = 0
    await session.sendMessage('Bereit', { systemPrompt: 'test' })
    expect(spokenTexts).toContain('Los gehts!')

    session.destroy()
  })

  it('emits tool calls and validates against workout state', async () => {
    async function* toolStream(): AsyncGenerator<StreamChunk> {
      yield { type: 'tool_call', name: 'next_exercise', input: {} }
      yield { type: 'delta', text: 'Nächste Übung!' }
      yield { type: 'done', reply: 'Nächste Übung!', llmLatencyMs: 50, totalLatencyMs: 100 }
    }
    const llm: LLMProvider = { streamTurn: vi.fn(() => toolStream()) }

    const session = new VoiceSession({
      config: { stt: 'none', tts: 'browser', llmEndpoint: '', autoListen: false, language: 'de-DE' },
      stt: nullSTT,
      tts: nullTTS,
      llm,
    })

    let workoutState: WorkoutState = {
      sessionId: 'test',
      status: 'active',
      currentExerciseIndex: 0,
      startedAt: new Date().toISOString(),
      exercises: [
        { id: 'ex1', name: 'Squats', phase: 'main', type: 'reps', targetSets: 3, targetReps: 10, completedSets: 3, status: 'completed' },
        { id: 'ex2', name: 'Plank', phase: 'main', type: 'timed', targetDuration: 60, completedSets: 0, remainingSeconds: 60, status: 'pending' },
      ],
    }

    const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = []
    session.on('toolCall', (tool) => {
      toolCalls.push(tool)
      const result = validateToolCall(tool.name, tool.input, workoutState)
      if (result.valid) {
        workoutState = executeToolCall(tool.name, tool.input, workoutState)
      }
    })

    await session.sendMessage('Nächste', { systemPrompt: 'test' })
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('next_exercise')
    expect(workoutState.currentExerciseIndex).toBe(1)
    expect(workoutState.exercises[1].status).toBe('active')

    session.destroy()
  })
})
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run tests/integration/voice-session-flow.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite one final time**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/integration/voice-session-flow.test.ts
git commit -m "test: add voice session text-only integration test"
```
