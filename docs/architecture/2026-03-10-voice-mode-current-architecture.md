# Voice Mode - Current Architecture (Ist-Stand)

Date: 2026-03-10  
Purpose: Short map of what is currently built, so we can discuss targeted changes.

## 1) System map
```mermaid
flowchart LR
  subgraph Client["Next.js Client"]
    SP["SessionPlayer.tsx"]
    VP["createVoiceProvider()"]
    ELP["ElevenLabsProvider (TTS)"]
    BTP["BrowserTTSProvider"]
    RTO["ElevenLabsRealtimeOrchestrator (STT WS)"]
  end

  subgraph API["Next.js API Routes"]
    TOK["POST /api/voice/tokens"]
    RTS["POST /api/voice/realtime/stream (SSE)"]
    RT["POST /api/voice/realtime (JSON)"]
    VS["GET /api/voice/stream (TTS stream)"]
    V["POST /api/voice (TTS buffered)"]
    TEL["POST /api/voice/telemetry"]
  end

  subgraph External["External Services"]
    ELSTT["ElevenLabs Realtime STT (WS)"]
    ELTTS["ElevenLabs TTS APIs"]
    ANT["Anthropic Claude Haiku 4.5"]
    SB["Supabase (Auth + Profile + Telemetry + Context)"]
  end

  SP --> VP
  VP --> ELP
  VP --> BTP
  SP --> RTO
  SP --> TOK
  RTO --> ELSTT
  SP --> RTS
  RTS --> ANT
  RTS --> SB
  ELP --> VS
  ELP --> V
  VS --> ELTTS
  V --> ELTTS
  SP --> TEL
  TEL --> SB
  TOK --> ELTTS
```

## 2) Voice turn (runtime)
```mermaid
sequenceDiagram
  participant U as User
  participant SP as SessionPlayer
  participant STT as Browser STT or Eleven STT
  participant API as /api/voice/realtime/stream
  participant ORCH as server-orchestrator.ts
  participant LLM as Claude Haiku 4.5
  participant TTS as ElevenLabsProvider
  participant VAPI as /api/voice/stream

  U->>SP: Mic mode ON (toggle)
  SP->>STT: start listening
  STT-->>SP: partial transcript
  STT-->>SP: committed transcript
  SP->>API: POST messages + currentExercise
  API->>ORCH: streamVoiceTurnOrchestration()
  ORCH->>LLM: streaming completion
  LLM-->>ORCH: text deltas
  ORCH-->>API: delta/done
  API-->>SP: SSE delta/done
  SP->>SP: sentence chunk queue
  loop per chunk
    SP->>TTS: speak(chunk)
    TTS->>VAPI: GET text chunk
    VAPI-->>TTS: audio stream
    TTS-->>SP: playback done
  end
  SP->>SP: if mic mode ON => resume listening
```

## 3) Frontend state model (current)
```mermaid
stateDiagram-v2
  [*] --> Pre
  Pre --> Coach: start session

  Coach --> Listening: mic ON + startListening()
  Listening --> Versteht: committed transcript
  Versteht --> Antwortet: sendUserMessage()
  Antwortet --> Listening: mic mode ON (auto resume)
  Antwortet --> Coach: mic mode OFF

  Listening --> Coach: mic OFF / stop / pause
  Coach --> Coach: typed message flow
```

Notes:
- UI rendering is currently not only `mode`, but combined from:
  - `mode` (`pre|coach|listening`)
  - `isMicModeEnabled`
  - `agentStatus` (`hoert_zu|versteht|antwortet|bereit`)
  - `isResponding`

## 4) API landscape
```mermaid
flowchart TD
  A["POST /api/voice/tokens"] --> A1["Eleven single-use STT/TTS token"]
  B["POST /api/voice/realtime/stream"] --> B1["SSE: delta/done/error"]
  C["POST /api/voice/realtime"] --> C1["JSON reply (legacy/non-stream)"]
  D["POST /api/voice/session"] --> D1["JSON reply (legacy alias)"]
  E["GET /api/voice/stream"] --> E1["streaming mp3"]
  F["POST /api/voice"] --> F1["buffered mp3"]
  G["POST /api/voice/telemetry"] --> G1["voice_telemetry_events insert"]
```

## 5) Current model/provider choices
- LLM for voice replies: `claude-haiku-4-5-20251001`
- STT realtime: ElevenLabs `scribe_v2_realtime` (WebSocket, VAD commit)
- TTS primary: ElevenLabs (`/api/voice/stream`)
- TTS fallback: browser `speechSynthesis`
- Provider switch (client): `NEXT_PUBLIC_VOICE_PROVIDER` (`elevenlabs` or `browser`)

## 6) Known instability hotspots (important for next fixes)
```mermaid
flowchart TB
  H1["State fan-out: mode + mic flag + agentStatus + isResponding"]
  H2["Async callbacks race: onend/onerror + timers + abort"]
  H3["Auto-resume timers can fire after stale transitions"]
  H4["Fallback switching realtime -> browser during active turn"]
  H5["Recognition.stop() triggers onend side effects"]

  H1 --> H2
  H2 --> H3
  H2 --> H4
  H2 --> H5
```

Interpretation:
- We currently have a working but complex state machine spread across UI and async callbacks.
- Next stabilization should reduce states and centralize transitions into one explicit voice session state machine.
