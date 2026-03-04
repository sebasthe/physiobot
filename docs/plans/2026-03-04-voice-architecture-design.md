# Voice Architecture Design
**Date:** 2026-03-04
**Status:** Approved

---

## Problem

The naive voice pipeline (Claude → ElevenLabs → play) introduces 4–6s of silence before audio starts. This breaks the real-time feel of a training session. At the same time, future versions need to support truly reactive voice coaching (responding to in-session user input).

---

## Decision

Use an abstraction layer (`VoicePlayer`) that hides the audio resolution strategy behind a single `play(cueId)` interface. The MVP fills a cache before the session starts (zero in-session latency). Phase 2 swaps in a streaming implementation without touching any calling code.

---

## Architecture

### VoiceCue

```typescript
interface VoiceCue {
  id: string
  text: string
  audioBlob?: Blob        // filled in MVP (pre-generated)
  streamFn?: () => Stream // filled in Phase 2 (real-time)
}
```

### VoicePlayer (`lib/voice/player.ts`)

Singleton service. Three resolution strategies, tried in order:

1. **Cache** — audio Blob already in memory → instant playback
2. **Streaming** — no cache hit → Claude streams text sentence-by-sentence → ElevenLabs Streaming API → audio chunks queued → HTMLAudioElement plays chunks (~1s perceived latency)
3. **Browser TTS** — fallback if both above fail → Web Speech API, zero latency, lower quality

```
VoicePlayer
  .prepare(cues: VoiceCue[])  → pre-generates all audio, fills cache
  .play(cueId: string)        → resolves via cache → stream → browser TTS
  .stop()                     → stops current playback
```

### Session components

Session UI calls only `VoicePlayer.play(cueId)`. It never knows which strategy ran. No changes to session components when upgrading to streaming.

---

## MVP Flow (Pre-generation)

```
User completes onboarding
  → /api/session/prepare called
  → Claude generates full session script as JSON array of VoiceCues
  → Promise.all: all cues sent to ElevenLabs in parallel
  → Audio Blobs stored in VoicePlayer cache (Map<cueId, Blob>)
  → "Preparing session…" screen dismisses
  → Training starts — all cues play instantly
```

Expected preparation time: ~5–15s depending on session length and network.

---

## Phase 2 Flow (Real-time Streaming)

```
VoicePlayer.play(cueId)
  → no cache hit (dynamic cue, not pre-generated)
  → Claude Streaming API called with cue context
  → sentence detector splits stream into chunks
  → each sentence → ElevenLabs Streaming API
  → audio chunks pushed to playback queue
  → HTMLAudioElement plays chunks as they arrive
  → perceived latency: ~0.8–1.5s
```

No changes required in session components or the VoicePlayer interface — only the internal resolution logic is extended.

---

## Provider Abstraction

Env variable controls TTS provider (unchanged from original design):

```
VOICE_PROVIDER=browser     → Browser Web Speech API (dev/offline)
VOICE_PROVIDER=elevenlabs  → ElevenLabs (prod)
```

The VoicePlayer respects this flag. In both cases, the cache-first resolution order stays the same. Browser TTS is always the final fallback regardless of `VOICE_PROVIDER`.

---

## File Structure

```
lib/voice/
  player.ts       ← VoicePlayer singleton (cache → stream → browser TTS)
  synthesize.ts   ← ElevenLabs TTS call (single cue, returns Blob)
  browser-tts.ts  ← Web Speech API wrapper
  types.ts        ← VoiceCue interface

app/api/session/
  prepare/route.ts  ← generates script via Claude + synthesizes all audio
```

---

## Out of Scope (MVP)

- Real-time reactive coaching (Phase 2)
- Persistent audio cache across sessions (Phase 2)
- ElevenLabs Streaming API integration (Phase 2)
