# Realtime Voice: 2-Sprint-Story

Datum: 2026-03-09

## Zielbild
- Fließender Voice-Dialog wie moderne Voice-Apps.
- Turn-taking automatisch per VAD (Nutzer spricht -> Pause -> Agent antwortet).
- Niedrige gefühlte Latenz und zuverlässige iPhone-Kompatibilität.
- Fallback auf Browser-TTS wenn ElevenLabs-Limits erreicht sind.

## Sprint 1 (MVP - umgesetzt)
- [x] Realtime STT über ElevenLabs WebSocket integriert (Token-basiert).
- [x] Session-Orchestrierung auf Client-Seite mit eigener Realtime-Orchestrator-Klasse.
- [x] Live-Status im UI: `Hört zu`, `Versteht…`, `Antwortet…`, `Bereit`.
- [x] Live-Transkript im Session-Screen, inklusive „bearbeiten“ für User-Einträge.
- [x] Interrupt: neuer Voice-Input stoppt laufende Agent-Audioausgabe.
- [x] Backchannel bei längerer Stille („Ja, ich höre dich…“ als Chat-Backchannel).
- [x] iPhone-Fallbacks: wenn Realtime nicht klappt, Browser-STT oder Text.
- [x] ElevenLabs-TTS-Fallback auf Browser-Stimme bleibt aktiv.

### Sprint-1 Dateien
- `components/training/SessionPlayer.tsx`
- `lib/voice/realtime-orchestrator.ts`
- `app/api/voice/tokens/route.ts`
- `app/training/session/page.tsx`
- `lib/voice/elevenlabs.ts` (vorheriger Fallback-Fix bleibt aktiv)

## Sprint 2 (Feinschliff - offen)
- [x] ElevenLabs Streaming-TTS-End-to-End (progressives HTTP-Streaming für frühere Wiedergabe).
- [x] Serverseitige dedizierte Turn-Orchestrierung über eigene Realtime-API (`/api/voice/realtime`) und Orchestrator-Service.
- [x] Telemetrie-Basis: Turn-Latenz, STT-Fehlerraten, Interrupt- und Fallback-Events.
- [x] Adaptive Prompting je Übungsphase (Warmup/Main/Cooldown Response-Hints).
- [ ] Verbesserte Noise-/Echo-Strategien für iPhone Lautsprecherbetrieb.
- [ ] Robustere Transcript-Korrektur inkl. „vor Senden editieren“ für Realtime-Commits.

## Akzeptanzkriterien Sprint 2
1. Median E2E-Latenz Ende Nutzersprechen -> erste Agenten-Audioausgabe < 800 ms.
2. Gesprächsfluss ohne „Push-to-talk“-Gefühl.
3. Stabiler Betrieb auf iPhone (Safari/PWA) inkl. Microphone-Permissions-Recovery.
4. Graceful Degradation bei API-Limits/Netzproblemen.

## Hinweis zur Architektur
- WebSocket-Full-Duplex-Orchestrierung bleibt optional als späterer Schritt.  
  Aktuell ist die serverseitige Turn-Orchestrierung dediziert ausgelagert und über Realtime-HTTP-Endpoints angebunden.
