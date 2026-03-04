# PhysioBot

AI-powered physiotherapy coaching PWA. Generates personalized training plans via Claude, coaches you through sessions with a voice coach, and adapts the plan based on your feedback over time.

## Features

- **Personalized onboarding** — DISC-style personality assessment + health profile (complaints, goals, fitness level)
- **AI plan generation** — Claude generates a warm-up / main / cool-down exercise plan tailored to your profile
- **Voice coaching** — Browser TTS (free) or ElevenLabs (high quality) during sessions
- **Active session player** — Exercise-by-exercise with countdown timer or rep counter
- **Post-session feedback** — Rate each exercise (too easy / right / too hard / painful); Claude adjusts the plan automatically
- **Progressive memory** — Mem0 remembers past pain points and preferences across sessions
- **PWA** — Installable on iPhone home screen via Safari

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| Auth & DB | Supabase (PostgreSQL + pgvector, EU region Frankfurt) |
| AI | Claude API (`claude-haiku-4-5`) |
| Memory | Mem0 (progressive user memory) |
| Voice | Browser Web Speech API / ElevenLabs (switchable via env var) |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) project (EU region recommended)
- [Anthropic API key](https://console.anthropic.com)
- Optional: [ElevenLabs API key](https://elevenlabs.io), [Mem0 API key](https://mem0.ai)

### Setup

```bash
# Install dependencies
npm install

# Copy env template
cp .env.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_VOICE_PROVIDER=browser   # or: elevenlabs
ELEVENLABS_API_KEY=                  # only needed for elevenlabs
ELEVENLABS_VOICE_ID=                 # optional, defaults to Adam
MEM0_API_KEY=                        # optional, memory disabled without it
```

### Database

Run the migration in Supabase Dashboard → SQL Editor:

```bash
cat supabase/migrations/001_initial_schema.sql
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  api/
    generate-plan/    # POST — generates AI training plan
    feedback/         # POST — saves feedback, adjusts plan
    voice/            # POST — ElevenLabs TTS proxy
  auth/               # Login / register / OAuth callback
  dashboard/          # Main dashboard with plan overview
  onboarding/
    personality/      # Step 1: motivation style, language, etc.
    health-profile/   # Step 2: complaints, goals, fitness level
  training/
    session/          # Active training session (full-screen)
    feedback/         # Post-session difficulty rating

components/
  auth/               # AuthForm
  layout/             # AppShell (bottom navigation)
  training/           # PlanOverview, SessionPlayer

lib/
  claude/             # Anthropic client + prompt builders
  supabase/           # Browser + server clients
  voice/              # VoiceProvider abstraction (browser / ElevenLabs)
  mem0.ts             # Mem0 memory wrapper
  knowledge-rag.ts    # Placeholder for physio domain knowledge RAG
  types.ts            # Shared TypeScript types
```

## Testing

```bash
npm run test:run     # run once
npm run test         # watch mode
```

23 tests across 8 files covering: auth forms, Claude prompt builders, voice provider factory, training plan overview, session player, Mem0 wrapper, feedback prompts.

## Design System

"Vital Dark" — deep warm charcoal with amber energy:

- Background: `#0D0B09`
- Primary (amber): `#F0A04B`
- Display font: Bebas Neue
- Body font: Plus Jakarta Sans

## Roadmap

- [ ] Physio professional role — assign plans to patients
- [ ] Knowledge RAG — physio domain expertise in system prompt
- [ ] AWS Bedrock EU — GDPR-compliant LLM processing
- [ ] Real app icons (currently placeholder)
