# PhysioBot MVP — Design Document
**Datum:** 2026-03-03
**Status:** Approved

---

## Produktvision

AI-gestützter Physiotherapie-Coach als Progressive Web App (iPhone-installierbar). Personalisierte Trainingspläne, motivierender Voice-Coach mit Tony-Robbins-Energie, und ein KI-System das den Nutzer progressiv besser kennenlernt. DSGVO-konform durch EU-Datenhaltung (schrittweise Migration).

---

## Stack

| Schicht | Technologie | Begründung |
|---|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS | Full-Stack in einem Repo, PWA-fähig |
| Datenbank & Auth | Supabase (EU-Region `eu-central-1`) | PostgreSQL + pgvector + Auth, Free Tier |
| LLM (Schritt 1) | Claude API (Anthropic) | Beste Konversationsqualität, einfaches Setup |
| LLM (Schritt 2) | AWS Bedrock EU | DSGVO-konforme EU-Datenhaltung |
| User Memory | Mem0 (Supabase pgvector Backend) | Managed Memory-Zyklus, kein neuer Service |
| Knowledge RAG | Supabase pgvector (vorgesehen) | Physio-Fachwissen, im MVP noch nicht befüllt |
| Voice (Dev) | Browser Web Speech API | Kostenlos, kein Setup |
| Voice (Prod) | ElevenLabs | Hochwertige, anpassbare Stimme |
| Deployment | Vercel | Einfachstes Next.js-Deployment |

---

## Architektur

```
┌─────────────────────────────────────────┐
│         iPhone / Browser (PWA)           │
│  Next.js 15 + TypeScript + Tailwind CSS  │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│        Next.js API Routes (Backend)      │
│  - /api/generate-plan   (Claude API)     │
│  - /api/voice           (TTS Provider)   │
│  - /api/feedback        (Plan-Anpassung) │
└──────┬───────────────────────┬──────────┘
       │                       │
┌──────▼───────┐    ┌──────────▼─────────┐
│  Supabase    │    │   Voice Provider   │
│  (EU-Region) │    │  Browser TTS (dev) │
│  - Auth      │    │  ElevenLabs (prod) │
│  - User DB   │    └────────────────────┘
│  - pgvector  │              │
│  - Mem0      │    ┌─────────▼──────────┐
└──────────────┘    │   Claude API       │
                    │ (Schritt 1: Anthropic) │
                    │ (Schritt 2: Bedrock EU) │
                    └────────────────────┘
```

---

## Voice-Abstraktion

Eine Env-Variable steuert den Provider — kein Code-Umbau nötig:

```
VOICE_PROVIDER=browser   # kostenlos, für Entwicklung & Testing
VOICE_PROVIDER=elevenlabs # hochwertig, für Produktion
```

---

## User Flow

```
Registrierung/Login
       │
       ▼
Persönlichkeits-Onboarding (einmalig, ~5-7 Fragen)
  → Motivationsstil, Feedback-Präferenz, Sprache, Coach-Persona
       │
       ▼
Health-Profil (einmalig)
  → Beschwerden, Ziele, Fitnesslevel, Trainingsdauer & -häufigkeit
       │
       ▼
Dashboard (Home)
  → Aktiver Plan, nächste Session, Fortschritt
       │
       ▼
Active Training Session
  → Übung-für-Übung mit Voice-Coach
  → Countdown / Wiederholungsbegleitung
  → Motivationsimpulse (Claude-generiert, personalisiert)
       │
       ▼
Post-Session Feedback
  → Übung zu leicht / zu schwer / schmerzhaft?
       │
       ▼
Plan-Anpassung (automatisch via Claude)
  → Mem0 speichert neue Erkenntnisse über den Nutzer
```

---

## Datenmodell

```sql
users
  id, email, role (patient | physio), active_plan_id, created_at

health_profiles
  user_id, complaints, goals, fitness_level, session_duration, frequency

user_personality
  user_id, motivation_style, feedback_style, language, coach_persona

user_memories          -- verwaltet durch Mem0
  id, user_id, memory (text), embedding (vector), created_at, source (onboarding | inferred)

training_plans
  id, assigned_to (user_id), created_by (user_id), source (ai | physio), exercises (JSON), created_at

physio_patients         -- für spätere Physio-Erweiterung
  physio_id, patient_id

knowledge_chunks        -- für Knowledge RAG (vorgesehen, MVP noch leer)
  id, content (text), embedding (vector), category, source, created_at

sessions
  id, plan_id, user_id, completed_at, feedback (JSON)
```

---

## Claude Prompt-Architektur

Jede Claude-Anfrage erhält folgenden System-Prompt-Aufbau:

```
[1] Rolle & Persönlichkeit
    → "Du bist ein energiegeladener Physiotherapie-Coach im Stil von Tony Robbins..."

[2] User Personality Profile (strukturiert)
    → Motivationsstil, Feedback-Präferenz, Coach-Persona

[3] User Memories (Mem0, top-N semantisch relevant)
    → "Nutzer reagiert gut auf direkte Challenges"
    → "Knieschmerzen links morgens stärker"

[4] Physio Knowledge (Knowledge RAG, top-N relevant)
    → Vorgesehen, im MVP noch nicht befüllt

[5] Aktueller Kontext
    → Trainingsplan, Session-Feedback, aktuelle Übung
```

---

## Fehlerbehandlung & Fallbacks

| Fehlerfall | Verhalten |
|---|---|
| Claude API nicht erreichbar | Letzten gespeicherten Plan anzeigen, User informieren |
| ElevenLabs Fehler | Automatisch auf Browser-TTS fallen |
| Supabase/Mem0 Fehler | Training läuft ohne Memory weiter (graceful degradation) |
| Kein Internet (PWA) | Aktiven Trainingsplan offline verfügbar (gecacht) |

---

## MVP-Scope (was gebaut wird)

- Registrierung + Login (Supabase Auth)
- Persönlichkeits-Onboarding (DISC)
- Health-Profil-Erfassung
- Claude generiert personalisierten Trainingsplan
- Active Training Session mit Voice-Coach
- Post-Session Feedback → automatische Plan-Anpassung
- Mem0-Memory: progressives User-Lernen
- PWA-Config für iPhone-Installation

## Architektonisch vorbereitet (nicht gebaut im MVP)

- Physio-Rolle + Patientenzuweisung (`physio_patients`, `role`-Feld)
- Knowledge RAG mit Physio-Fachwissen (`knowledge_chunks`)
- AWS Bedrock EU Migration (LLM-Austausch via Env-Variable)
- Fortschrittsübersicht & Daten-Export/Löschung (DSGVO)

---

## Testing-Ansatz (MVP)

- Manuelle Tests für kritische Pfade (Plan-Generierung, Voice-Switch, Feedback-Anpassung)
- Unit-Tests für Voice-Abstraktion und Claude-Prompt-Logik
- Keine CI/CD-Pipeline im MVP
