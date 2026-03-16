# Voice Provider Matrix

Purpose: Explain which speech providers PhysioBot can use today and how provider selection affects language, cost, and fallback behavior.

## Summary

The current voice stack is split into:

- STT providers for user speech input
- TTS providers for coach audio output

Provider choice is made in the session player and can change runtime behavior.

## Current Provider Matrix

| Capability | Provider | Notes |
| --- | --- | --- |
| STT | ElevenLabs realtime | preferred when `NEXT_PUBLIC_VOICE_PROVIDER=elevenlabs` |
| STT | Browser speech recognition | used as the non-Eleven fallback when supported |
| STT | none | used when browser speech recognition is unavailable |
| TTS | ElevenLabs | server-backed streaming or full synthesis with browser fallback |
| TTS | Browser speech synthesis | lowest-friction default |
| TTS | Kokoro | local client-side model, useful for dev and cost control |

## Selection Rules

- `NEXT_PUBLIC_VOICE_PROVIDER=elevenlabs` selects ElevenLabs-first mode
- `NEXT_PUBLIC_VOICE_PROVIDER=kokoro` selects Kokoro for TTS and browser STT where available
- any other value falls back to browser TTS
- if ElevenLabs STT fails and browser speech recognition exists, the client falls back to browser STT

## Kokoro-Specific Notes

- Kokoro runs client-side and loads a model in the browser
- the default loading path prefers `wasm` unless explicitly overridden
- because the current Kokoro setup uses English voices, the coach language is forced to `en` when Kokoro TTS is selected
- this makes Kokoro an architecture-level choice, not just a cosmetic TTS swap

## Architecture Implication

Voice-provider choice affects:

- infrastructure cost
- startup latency and model loading behavior
- available coach language behavior
- fallback paths when speech services fail

## Related Documents

- [Voice Mode - Current Architecture](2026-03-10-voice-mode-current-architecture.md)
- [Voice Telemetry and Observability](voice-telemetry-and-observability.md)
- [ADR-0006 Kokoro Local TTS](../adr/ADR-0006-kokoro-local-tts.md)
