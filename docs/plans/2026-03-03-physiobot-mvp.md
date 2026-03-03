# PhysioBot MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a physiotherapy coaching PWA with personalized AI-generated training plans, voice coaching, and progressive user memory.

**Architecture:** Next.js 15 full-stack app with API routes calling Claude for plan generation and coaching. Supabase handles auth + PostgreSQL + pgvector. Mem0 manages user memory with Supabase as backend. Voice switches between Browser TTS (dev) and ElevenLabs (prod) via env var.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase, Claude API (`@anthropic-ai/sdk`), Mem0 (`mem0ai`), ElevenLabs, Vitest + React Testing Library, Vercel (deploy), next-pwa

**UI Skill:** Use `frontend-design` skill for Task 2 (Design System) and at the start of every screen task (Tasks 4, 5, 6, 8, 10, 11).

---

## Prerequisites (do these manually before starting tasks)

1. Create a Supabase project at https://supabase.com — choose EU region (`eu-central-1` / Frankfurt)
2. Copy your Supabase project URL and anon key
3. Get Anthropic API key from https://console.anthropic.com
4. (Optional) Get ElevenLabs API key from https://elevenlabs.io — only needed for `VOICE_PROVIDER=elevenlabs`

---

## Task 1: Project Initialization & shadcn/ui Setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `.env.local`, `.env.example`
- Create: `app/layout.tsx`, `app/page.tsx`
- Create: `vitest.config.ts`, `vitest.setup.ts`

**Step 1: Create Next.js app**

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

Expected: Project scaffold created in current directory.

**Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk mem0ai
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

**Step 3: Configure Vitest**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Create `vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

Add to `package.json` scripts:
```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 4: Create `.env.local`**

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
ANTHROPIC_API_KEY=your-anthropic-key
VOICE_PROVIDER=browser
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

Create `.env.example` with same keys but empty values (commit this, not `.env.local`).

**Step 5: Install shadcn/ui**

```bash
npx shadcn@latest init
```

Choose: TypeScript → Default style → Slate base color → CSS variables → yes.

```bash
npx shadcn@latest add button card input label textarea progress badge
```

Expected: `components/ui/` folder created with shadcn components.

**Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Server running at http://localhost:3000, page loads without errors.

**Step 7: Commit**

```bash
git init
git add . --exclude='.env.local'
git commit -m "feat: initialize Next.js 15 + shadcn/ui project with Vitest"
```

---

## Task 2: Design System

> **REQUIRED SKILL:** Invoke `frontend-design` skill before writing any code in this task.

**Goal:** Establish the visual identity of PhysioBot — colors, typography, spacing, and reusable base components. All subsequent screen tasks build on this foundation.

**Files:**
- Create: `app/globals.css` (update CSS variables)
- Create: `components/ui/theme.ts` (design tokens)
- Create: `components/layout/AppShell.tsx` (mobile-first wrapper with bottom nav)

**Step 1: Invoke frontend-design skill**

Prompt to use with the skill:
> "Design system for PhysioBot — a physiotherapy coaching PWA for iPhone. Health/wellness aesthetic, not clinical. Dark mode optional. Mobile-first. Needs: primary action color, success/warning/danger states, card style for exercise items, large countdown timer display, bottom navigation bar with 3 items (Home, Training, Progress). Use shadcn/ui as base, extend with custom CSS variables."

**Step 2: Apply generated design tokens to `app/globals.css`**

Update the `:root` CSS variables from the frontend-design output. Replace default shadcn slate palette with PhysioBot colors.

**Step 3: Create AppShell component**

Create `components/layout/AppShell.tsx` — mobile-first layout wrapper with:
- Max-width container centered
- Bottom navigation bar (Home / Training / Progress)
- Safe-area insets for iPhone notch

**Step 4: Verify visually**

```bash
npm run dev
```

Open http://localhost:3000 on iPhone Safari or Chrome DevTools mobile view. Verify design feels like a health app, not a generic website.

**Step 5: Commit**

```bash
git add app/globals.css components/layout/ components/ui/
git commit -m "feat: add design system and AppShell layout"
```

---

## Task 3: Supabase Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`

**Step 1: Write the SQL migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable pgvector for RAG
create extension if not exists vector;

-- Users are managed by Supabase Auth (auth.users)
-- We extend with a profiles table

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null default 'patient' check (role in ('patient', 'physio')),
  active_plan_id uuid,
  created_at timestamptz not null default now()
);

create table public.health_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  complaints text[] not null default '{}',
  goals text not null,
  fitness_level text not null check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  session_duration_minutes int not null default 20,
  sessions_per_week int not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_personality (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  motivation_style text not null check (motivation_style in ('goal_oriented', 'pain_avoidance', 'mixed')),
  feedback_style text not null check (feedback_style in ('direct', 'gentle', 'energetic')),
  language text not null default 'de' check (language in ('de', 'en')),
  coach_persona text not null default 'tony_robbins',
  created_at timestamptz not null default now()
);

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  assigned_to uuid references public.profiles(id) on delete cascade not null,
  created_by uuid references public.profiles(id) on delete set null,
  source text not null check (source in ('ai', 'physio')),
  exercises jsonb not null,
  created_at timestamptz not null default now()
);

-- Add FK after training_plans exists
alter table public.profiles
  add constraint fk_active_plan
  foreign key (active_plan_id) references public.training_plans(id) on delete set null;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.training_plans(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  completed_at timestamptz,
  feedback jsonb,
  created_at timestamptz not null default now()
);

-- Mem0 user memories with vector embeddings
create table public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  memory text not null,
  embedding vector(1536),
  source text not null default 'inferred' check (source in ('onboarding', 'inferred')),
  created_at timestamptz not null default now()
);
create index on public.user_memories using ivfflat (embedding vector_cosine_ops);

-- Knowledge RAG (placeholder, populated later)
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536),
  category text,
  source text,
  created_at timestamptz not null default now()
);
create index on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops);

-- Physio-patient assignments (for future physio feature)
create table public.physio_patients (
  physio_id uuid references public.profiles(id) on delete cascade not null,
  patient_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (physio_id, patient_id)
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.health_profiles enable row level security;
alter table public.user_personality enable row level security;
alter table public.training_plans enable row level security;
alter table public.sessions enable row level security;
alter table public.user_memories enable row level security;

create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Users manage own health profile" on public.health_profiles for all using (auth.uid() = user_id);
create policy "Users manage own personality" on public.user_personality for all using (auth.uid() = user_id);
create policy "Users read own plans" on public.training_plans for select using (auth.uid() = assigned_to);
create policy "Users manage own sessions" on public.sessions for all using (auth.uid() = user_id);
create policy "Users manage own memories" on public.user_memories for all using (auth.uid() = user_id);
```

**Step 2: Run migration in Supabase**

In Supabase dashboard → SQL Editor → paste and run the migration.

Expected: All tables created without errors.

**Step 3: Create Supabase browser client**

Create `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 4: Create Supabase server client**

Create `lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

**Step 5: Write and run a smoke test**

Create `tests/lib/supabase.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { createClient } from '@/lib/supabase/client'

describe('supabase client', () => {
  it('creates a client without throwing', () => {
    expect(() => createClient()).not.toThrow()
  })
})
```

```bash
npm run test:run tests/lib/supabase.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add supabase/ lib/supabase/ tests/lib/supabase.test.ts
git commit -m "feat: add supabase schema and client setup"
```

---

## Task 4: Authentication

**Files:**
- Create: `app/auth/login/page.tsx`
- Create: `app/auth/register/page.tsx`
- Create: `app/auth/callback/route.ts`
- Create: `middleware.ts`
- Create: `components/auth/AuthForm.tsx`
- Create: `tests/components/auth/AuthForm.test.tsx`

**Step 1: Write failing test for AuthForm**

Create `tests/components/auth/AuthForm.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import AuthForm from '@/components/auth/AuthForm'

describe('AuthForm', () => {
  it('renders email and password fields', () => {
    render(<AuthForm mode="login" onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument()
  })

  it('calls onSubmit with email and password', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<AuthForm mode="login" onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/passwort/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /anmelden/i }))

    expect(onSubmit).toHaveBeenCalledWith({ email: 'test@example.com', password: 'secret123' })
  })

  it('shows register button text when mode is register', () => {
    render(<AuthForm mode="register" onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /registrieren/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/components/auth/AuthForm.test.tsx
```

Expected: FAIL — `AuthForm` not found.

**Step 3: Implement AuthForm**

Create `components/auth/AuthForm.tsx`:
```typescript
'use client'
import { useState } from 'react'

interface AuthFormProps {
  mode: 'login' | 'register'
  onSubmit: (data: { email: string; password: string }) => void
  isLoading?: boolean
  error?: string
}

export default function AuthForm({ mode, onSubmit, isLoading, error }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ email, password })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">Passwort</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {mode === 'login' ? 'Anmelden' : 'Registrieren'}
      </button>
    </form>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run tests/components/auth/AuthForm.test.tsx
```

Expected: PASS (3 tests)

**Step 5: Create login page**

Create `app/auth/login/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthForm from '@/components/auth/AuthForm'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [error, setError] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async ({ email, password }: { email: string; password: string }) => {
    setIsLoading(true)
    setError(undefined)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
    }
    setIsLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">PhysioBot</h1>
        <AuthForm mode="login" onSubmit={handleLogin} isLoading={isLoading} error={error} />
        <p className="text-center text-sm">
          Noch kein Account?{' '}
          <Link href="/auth/register" className="text-blue-600 underline">Registrieren</Link>
        </p>
      </div>
    </main>
  )
}
```

**Step 6: Create register page**

Create `app/auth/register/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AuthForm from '@/components/auth/AuthForm'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [error, setError] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleRegister = async ({ email, password }: { email: string; password: string }) => {
    setIsLoading(true)
    setError(undefined)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/onboarding/personality')
    }
    setIsLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-bold text-center">PhysioBot – Registrieren</h1>
        <AuthForm mode="register" onSubmit={handleRegister} isLoading={isLoading} error={error} />
        <p className="text-center text-sm">
          Bereits registriert?{' '}
          <Link href="/auth/login" className="text-blue-600 underline">Anmelden</Link>
        </p>
      </div>
    </main>
  )
}
```

**Step 7: Create auth callback route (for email confirmation)**

Create `app/auth/callback/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
```

**Step 8: Create middleware for protected routes**

Create `middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  const protectedRoutes = ['/dashboard', '/onboarding', '/training']
  const isProtected = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

**Step 9: Verify manually**

```bash
npm run dev
```

Navigate to http://localhost:3000/auth/register, create an account. Expected: Redirected to `/onboarding/personality` (page not yet built — 404 is fine).

**Step 10: Commit**

```bash
git add app/auth/ components/auth/ middleware.ts tests/components/auth/
git commit -m "feat: add authentication with Supabase Auth"
```

---

## Task 5: Personality Onboarding

> **REQUIRED SKILL:** Invoke `frontend-design` skill before writing the page. Prompt: "Onboarding step screen for PhysioBot PWA — shows one question at a time with large selectable option cards, progress indicator at top, forward button at bottom. Warm, motivating aesthetic. Use existing design system."

**Files:**
- Create: `app/onboarding/personality/page.tsx`
- Create: `lib/types.ts`
- Create: `tests/lib/types.test.ts`

**Step 1: Define shared types**

Create `lib/types.ts`:
```typescript
export type MotivationStyle = 'goal_oriented' | 'pain_avoidance' | 'mixed'
export type FeedbackStyle = 'direct' | 'gentle' | 'energetic'
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'
export type Language = 'de' | 'en'

export interface UserPersonality {
  motivation_style: MotivationStyle
  feedback_style: FeedbackStyle
  language: Language
  coach_persona: string
}

export interface HealthProfile {
  complaints: string[]
  goals: string
  fitness_level: FitnessLevel
  session_duration_minutes: number
  sessions_per_week: number
}

export interface Exercise {
  name: string
  description: string
  duration_seconds?: number
  repetitions?: number
  sets?: number
  phase: 'warmup' | 'main' | 'cooldown'
  voice_script: string
}

export interface TrainingPlan {
  id?: string
  exercises: Exercise[]
  source: 'ai' | 'physio'
}

export interface SessionFeedback {
  exercise_id: string
  difficulty: 'too_easy' | 'right' | 'too_hard' | 'painful'
  notes?: string
}
```

**Step 2: Create personality onboarding page**

Create `app/onboarding/personality/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { MotivationStyle, FeedbackStyle, Language } from '@/lib/types'

const COACH_PERSONAS = [
  { id: 'tony_robbins', label: 'Tony Robbins – Energie & Durchbruch' },
  { id: 'calm_coach', label: 'Ruhiger Sportcoach – Fokus & Ausdauer' },
  { id: 'drill_sergeant', label: 'Drill Sergeant – Direkt & Fordernd' },
]

export default function PersonalityOnboardingPage() {
  const [step, setStep] = useState(0)
  const [motivationStyle, setMotivationStyle] = useState<MotivationStyle>('mixed')
  const [feedbackStyle, setFeedbackStyle] = useState<FeedbackStyle>('energetic')
  const [language, setLanguage] = useState<Language>('de')
  const [coachPersona, setCoachPersona] = useState('tony_robbins')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const questions = [
    {
      question: 'Was motiviert dich beim Training am meisten?',
      options: [
        { value: 'goal_oriented', label: 'Ich will ein konkretes Ziel erreichen' },
        { value: 'pain_avoidance', label: 'Ich will Schmerzen und Einschränkungen loswerden' },
        { value: 'mixed', label: 'Beides ist mir wichtig' },
      ],
      value: motivationStyle,
      onChange: (v: string) => setMotivationStyle(v as MotivationStyle),
    },
    {
      question: 'Wie möchtest du während des Trainings angesprochen werden?',
      options: [
        { value: 'energetic', label: 'Energiegeladen und motivierend' },
        { value: 'direct', label: 'Direkt und fordernd' },
        { value: 'gentle', label: 'Sanft und ermutigend' },
      ],
      value: feedbackStyle,
      onChange: (v: string) => setFeedbackStyle(v as FeedbackStyle),
    },
    {
      question: 'Welchen Coach-Stil bevorzugst du?',
      options: COACH_PERSONAS.map(p => ({ value: p.id, label: p.label })),
      value: coachPersona,
      onChange: setCoachPersona,
    },
    {
      question: 'In welcher Sprache soll der Coach sprechen?',
      options: [
        { value: 'de', label: 'Deutsch' },
        { value: 'en', label: 'English' },
      ],
      value: language,
      onChange: (v: string) => setLanguage(v as Language),
    },
  ]

  const current = questions[step]

  const handleNext = async () => {
    if (step < questions.length - 1) {
      setStep(step + 1)
      return
    }
    // Last step — save to Supabase
    setIsLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('user_personality').upsert({
      user_id: user.id,
      motivation_style: motivationStyle,
      feedback_style: feedbackStyle,
      language,
      coach_persona: coachPersona,
    })

    router.push('/onboarding/health-profile')
    setIsLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-sm text-gray-500">{step + 1} / {questions.length}</div>
        <h2 className="text-xl font-semibold">{current.question}</h2>
        <div className="space-y-3">
          {current.options.map(option => (
            <button
              key={option.value}
              onClick={() => current.onChange(option.value)}
              className={`w-full text-left rounded-lg border p-4 transition ${
                current.value === option.value
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleNext}
          disabled={isLoading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {step < questions.length - 1 ? 'Weiter' : 'Speichern'}
        </button>
      </div>
    </main>
  )
}
```

**Step 3: Verify manually**

```bash
npm run dev
```

Login, navigate to `/onboarding/personality`. Expected: 4-step questionnaire works.

**Step 4: Commit**

```bash
git add app/onboarding/personality/ lib/types.ts
git commit -m "feat: add personality onboarding"
```

---

## Task 6: Health Profile Onboarding

> **REQUIRED SKILL:** Invoke `frontend-design` skill before writing the page. Prompt: "Health profile form for PhysioBot PWA — multi-select complaint chips (back, knee, shoulder etc.), goal text area, fitness level selector, duration/frequency sliders. Clean, medical-adjacent but friendly. Mobile-first."

**Files:**
- Create: `app/onboarding/health-profile/page.tsx`

**Step 1: Create health profile page**

Create `app/onboarding/health-profile/page.tsx`:
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { FitnessLevel } from '@/lib/types'

const COMPLAINT_OPTIONS = [
  'Rückenschmerzen',
  'Knieschmerzen',
  'Schulterschmerzen',
  'Haltungsprobleme',
  'Hüftschmerzen',
  'Nackenschmerzen',
]

export default function HealthProfilePage() {
  const [complaints, setComplaints] = useState<string[]>([])
  const [goals, setGoals] = useState('')
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('beginner')
  const [sessionDuration, setSessionDuration] = useState(20)
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const toggleComplaint = (c: string) => {
    setComplaints(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('health_profiles').upsert({
      user_id: user.id,
      complaints,
      goals,
      fitness_level: fitnessLevel,
      session_duration_minutes: sessionDuration,
      sessions_per_week: sessionsPerWeek,
    })

    router.push('/dashboard')
    setIsLoading(false)
  }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto space-y-6 pt-8">
      <h1 className="text-2xl font-bold">Dein Gesundheitsprofil</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block font-medium mb-2">Wo hast du Beschwerden?</label>
          <div className="grid grid-cols-2 gap-2">
            {COMPLAINT_OPTIONS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => toggleComplaint(c)}
                className={`rounded border p-2 text-sm ${
                  complaints.includes(c) ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="goals" className="block font-medium mb-1">Was ist dein Trainingsziel?</label>
          <textarea
            id="goals"
            value={goals}
            onChange={e => setGoals(e.target.value)}
            required
            rows={3}
            placeholder="z.B. Rückenschmerzen reduzieren, Mobilität verbessern..."
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label className="block font-medium mb-2">Fitnesslevel</label>
          {(['beginner', 'intermediate', 'advanced'] as FitnessLevel[]).map(level => (
            <button
              key={level}
              type="button"
              onClick={() => setFitnessLevel(level)}
              className={`mr-2 rounded border px-4 py-2 ${
                fitnessLevel === level ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
              }`}
            >
              {level === 'beginner' ? 'Anfänger' : level === 'intermediate' ? 'Mittel' : 'Fortgeschritten'}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="duration" className="block font-medium mb-1">
            Trainingsdauer: {sessionDuration} Minuten
          </label>
          <input
            id="duration"
            type="range"
            min={10} max={60} step={5}
            value={sessionDuration}
            onChange={e => setSessionDuration(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <label htmlFor="frequency" className="block font-medium mb-1">
            Trainingseinheiten pro Woche: {sessionsPerWeek}
          </label>
          <input
            id="frequency"
            type="range"
            min={1} max={7} step={1}
            value={sessionsPerWeek}
            onChange={e => setSessionsPerWeek(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !goals}
          className="w-full rounded bg-blue-600 px-4 py-3 text-white font-medium disabled:opacity-50"
        >
          Trainingsplan erstellen
        </button>
      </form>
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add app/onboarding/health-profile/
git commit -m "feat: add health profile onboarding"
```

---

## Task 7: Claude Integration — Plan Generation

**Files:**
- Create: `lib/claude/client.ts`
- Create: `lib/claude/prompts.ts`
- Create: `app/api/generate-plan/route.ts`
- Create: `tests/lib/claude/prompts.test.ts`

**Step 1: Write failing tests for prompt builder**

Create `tests/lib/claude/prompts.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildPlanRequestMessage } from '@/lib/claude/prompts'
import type { UserPersonality, HealthProfile } from '@/lib/types'

const personality: UserPersonality = {
  motivation_style: 'goal_oriented',
  feedback_style: 'energetic',
  language: 'de',
  coach_persona: 'tony_robbins',
}

const healthProfile: HealthProfile = {
  complaints: ['Rückenschmerzen'],
  goals: 'Rücken stärken',
  fitness_level: 'beginner',
  session_duration_minutes: 20,
  sessions_per_week: 3,
}

describe('buildSystemPrompt', () => {
  it('includes coach persona', () => {
    const prompt = buildSystemPrompt({ personality, memories: [] })
    expect(prompt).toContain('Tony Robbins')
  })

  it('includes language instruction', () => {
    const prompt = buildSystemPrompt({ personality, memories: [] })
    expect(prompt).toContain('Deutsch')
  })

  it('includes memories when provided', () => {
    const prompt = buildSystemPrompt({
      personality,
      memories: ['Nutzer hat Knieschmerzen links'],
    })
    expect(prompt).toContain('Knieschmerzen links')
  })
})

describe('buildPlanRequestMessage', () => {
  it('includes session duration', () => {
    const message = buildPlanRequestMessage({ healthProfile })
    expect(message).toContain('20')
  })

  it('includes complaints', () => {
    const message = buildPlanRequestMessage({ healthProfile })
    expect(message).toContain('Rückenschmerzen')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/lib/claude/prompts.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement Claude client and prompts**

Create `lib/claude/client.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})
```

Create `lib/claude/prompts.ts`:
```typescript
import type { UserPersonality, HealthProfile } from '@/lib/types'

const PERSONA_DESCRIPTIONS: Record<string, string> = {
  tony_robbins: 'Tony Robbins — energiegeladen, motivierend, mit Kraft und Überzeugung. Du gibst dem Nutzer das Gefühl, alles erreichen zu können.',
  calm_coach: 'ein ruhiger, fokussierter Sportcoach — klar, geduldig, unterstützend.',
  drill_sergeant: 'ein direkter Drill Sergeant — knapp, fordernd, keine Ausreden.',
}

const LANGUAGE_LABELS: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
}

export function buildSystemPrompt({
  personality,
  memories,
}: {
  personality: UserPersonality
  memories: string[]
}): string {
  const persona = PERSONA_DESCRIPTIONS[personality.coach_persona] ?? PERSONA_DESCRIPTIONS.tony_robbins
  const language = LANGUAGE_LABELS[personality.language] ?? 'Deutsch'

  const memoriesBlock = memories.length > 0
    ? `\n\nWas du über diesen Nutzer weißt:\n${memories.map(m => `- ${m}`).join('\n')}`
    : ''

  return `Du bist ein AI-Physiotherapie-Coach mit der Persönlichkeit von ${persona}

Sprich immer auf ${language}. Sei ${personality.feedback_style === 'energetic' ? 'energiegeladen und motivierend' : personality.feedback_style === 'direct' ? 'direkt und fordernd' : 'sanft und ermutigend'}.
${memoriesBlock}

Wenn du Trainingspläne erstellst, antworte IMMER als valides JSON ohne Markdown-Codeblöcke.`
}

export function buildPlanRequestMessage({
  healthProfile,
}: {
  healthProfile: HealthProfile
}): string {
  return `Erstelle einen personalisierten Physiotherapie-Trainingsplan.

Nutzer-Profil:
- Beschwerden: ${healthProfile.complaints.join(', ') || 'keine spezifischen'}
- Trainingsziel: ${healthProfile.goals}
- Fitnesslevel: ${healthProfile.fitness_level}
- Trainingsdauer: ${healthProfile.session_duration_minutes} Minuten

Antworte mit folgendem JSON-Format:
{
  "exercises": [
    {
      "name": "Übungsname",
      "description": "Kurze Beschreibung wie die Übung ausgeführt wird",
      "phase": "warmup" | "main" | "cooldown",
      "duration_seconds": 30,
      "repetitions": null,
      "sets": null,
      "voice_script": "Motivierender Text den der Coach vorliest"
    }
  ]
}

Erstelle 3-4 Aufwärmübungen, 4-6 Hauptübungen und 2-3 Cooldown-Übungen.
Passe die Gesamtdauer auf ${healthProfile.session_duration_minutes} Minuten an.`
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:run tests/lib/claude/prompts.test.ts
```

Expected: PASS (5 tests)

**Step 5: Create API route for plan generation**

Create `app/api/generate-plan/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/claude/client'
import { buildSystemPrompt, buildPlanRequestMessage } from '@/lib/claude/prompts'
import type { HealthProfile, UserPersonality, TrainingPlan } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch user data
  const [{ data: personality }, { data: healthProfile }] = await Promise.all([
    supabase.from('user_personality').select('*').eq('user_id', user.id).single(),
    supabase.from('health_profiles').select('*').eq('user_id', user.id).single(),
  ])

  if (!personality || !healthProfile) {
    return NextResponse.json({ error: 'Profile incomplete' }, { status: 400 })
  }

  // Fetch recent memories (simple recency for now — Mem0 replaces this in Task 10)
  const { data: memories } = await supabase
    .from('user_memories')
    .select('memory')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const memoryTexts = (memories ?? []).map(m => m.memory)

  const systemPrompt = buildSystemPrompt({
    personality: personality as UserPersonality,
    memories: memoryTexts,
  })

  const message = buildPlanRequestMessage({ healthProfile: healthProfile as HealthProfile })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    const planData = JSON.parse(content.text) as Pick<TrainingPlan, 'exercises'>

    // Save plan to database
    const { data: plan, error } = await supabase
      .from('training_plans')
      .insert({
        assigned_to: user.id,
        created_by: user.id,
        source: 'ai',
        exercises: planData.exercises,
      })
      .select()
      .single()

    if (error) throw error

    // Set as active plan
    await supabase
      .from('profiles')
      .update({ active_plan_id: plan.id })
      .eq('id', user.id)

    return NextResponse.json(plan)
  } catch (err) {
    console.error('Plan generation failed:', err)
    return NextResponse.json({ error: 'Plan generation failed' }, { status: 500 })
  }
}
```

**Step 6: Commit**

```bash
git add lib/claude/ app/api/generate-plan/ tests/lib/claude/
git commit -m "feat: add Claude plan generation API"
```

---

## Task 8: Dashboard

> **REQUIRED SKILL:** Invoke `frontend-design` skill before writing the page. Prompt: "Dashboard home screen for PhysioBot PWA — shows today's training plan card with exercise list grouped by phase (warmup/main/cooldown), large 'Training starten' CTA button, loading state while Claude generates plan. Mobile-first, health app aesthetic."

**Files:**
- Create: `app/dashboard/page.tsx`
- Create: `components/training/PlanOverview.tsx`
- Create: `tests/components/training/PlanOverview.test.tsx`

**Step 1: Write failing test**

Create `tests/components/training/PlanOverview.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import PlanOverview from '@/components/training/PlanOverview'
import type { Exercise } from '@/lib/types'

const exercises: Exercise[] = [
  { name: 'Katzenbuckel', description: 'Rücken mobilisieren', phase: 'warmup',
    duration_seconds: 30, voice_script: 'Los geht\'s!' },
  { name: 'Brücke', description: 'Gesäß heben', phase: 'main',
    repetitions: 10, sets: 3, voice_script: 'Halte die Spannung!' },
]

describe('PlanOverview', () => {
  it('shows warmup and main exercises', () => {
    render(<PlanOverview exercises={exercises} onStartTraining={() => {}} />)
    expect(screen.getByText('Katzenbuckel')).toBeInTheDocument()
    expect(screen.getByText('Brücke')).toBeInTheDocument()
  })

  it('shows start button', () => {
    render(<PlanOverview exercises={exercises} onStartTraining={() => {}} />)
    expect(screen.getByRole('button', { name: /training starten/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/components/training/PlanOverview.test.tsx
```

Expected: FAIL

**Step 3: Implement PlanOverview component**

Create `components/training/PlanOverview.tsx`:
```typescript
import type { Exercise } from '@/lib/types'

const PHASE_LABELS = { warmup: 'Aufwärmen', main: 'Hauptteil', cooldown: 'Cooldown' }

interface Props {
  exercises: Exercise[]
  onStartTraining: () => void
}

export default function PlanOverview({ exercises, onStartTraining }: Props) {
  const phases = ['warmup', 'main', 'cooldown'] as const

  return (
    <div className="space-y-6">
      {phases.map(phase => {
        const phaseExercises = exercises.filter(e => e.phase === phase)
        if (phaseExercises.length === 0) return null
        return (
          <div key={phase}>
            <h3 className="font-semibold text-gray-700 mb-2">{PHASE_LABELS[phase]}</h3>
            <ul className="space-y-2">
              {phaseExercises.map((ex, i) => (
                <li key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="font-medium">{ex.name}</div>
                  <div className="text-sm text-gray-500">{ex.description}</div>
                  {ex.duration_seconds && (
                    <div className="text-xs text-gray-400">{ex.duration_seconds}s</div>
                  )}
                  {ex.repetitions && ex.sets && (
                    <div className="text-xs text-gray-400">{ex.sets}x {ex.repetitions} Wdh.</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <button
        onClick={onStartTraining}
        className="w-full rounded-lg bg-blue-600 py-3 text-white font-semibold text-lg"
      >
        Training starten
      </button>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run tests/components/training/PlanOverview.test.tsx
```

Expected: PASS

**Step 5: Create Dashboard page**

Create `app/dashboard/page.tsx`:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, training_plans(*)')
    .eq('id', user.id)
    .single()

  // First visit: no plan yet — trigger generation
  if (!profile?.active_plan_id) {
    const { data: healthProfile } = await supabase
      .from('health_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!healthProfile) redirect('/onboarding/personality')
  }

  return <DashboardClient profile={profile} userId={user.id} />
}
```

Create `app/dashboard/DashboardClient.tsx`:
```typescript
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PlanOverview from '@/components/training/PlanOverview'
import type { Exercise } from '@/lib/types'

interface Props {
  profile: { active_plan_id: string | null; training_plans?: { exercises: Exercise[] } | null }
  userId: string
}

export default function DashboardClient({ profile, userId }: Props) {
  const [isGenerating, setIsGenerating] = useState(!profile.active_plan_id)
  const [exercises, setExercises] = useState<Exercise[]>(
    (profile.training_plans?.exercises as Exercise[]) ?? []
  )
  const router = useRouter()

  useEffect(() => {
    if (!profile.active_plan_id) {
      generatePlan()
    }
  }, [])

  const generatePlan = async () => {
    setIsGenerating(true)
    const res = await fetch('/api/generate-plan', { method: 'POST' })
    if (res.ok) {
      const plan = await res.json()
      setExercises(plan.exercises)
    }
    setIsGenerating(false)
  }

  if (isGenerating) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-lg font-medium">Erstelle deinen Trainingsplan...</div>
          <div className="text-sm text-gray-500">Claude analysiert dein Profil</div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto pt-8">
      <h1 className="text-2xl font-bold mb-6">Dein Trainingsplan</h1>
      <PlanOverview
        exercises={exercises}
        onStartTraining={() => router.push('/training/session')}
      />
    </main>
  )
}
```

**Step 6: Commit**

```bash
git add app/dashboard/ components/training/PlanOverview.tsx tests/components/training/
git commit -m "feat: add dashboard with plan overview and generation"
```

---

## Task 9: Voice Abstraction Layer

**Files:**
- Create: `lib/voice/types.ts`
- Create: `lib/voice/browser-tts.ts`
- Create: `lib/voice/elevenlabs.ts`
- Create: `lib/voice/index.ts`
- Create: `app/api/voice/route.ts`
- Create: `tests/lib/voice/index.test.ts`

**Step 1: Write failing tests**

Create `tests/lib/voice/index.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock environment before importing
describe('createVoiceProvider', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns BrowserTTSProvider when VOICE_PROVIDER is browser', async () => {
    vi.stubEnv('NEXT_PUBLIC_VOICE_PROVIDER', 'browser')
    const { createVoiceProvider } = await import('@/lib/voice/index')
    const { BrowserTTSProvider } = await import('@/lib/voice/browser-tts')
    expect(createVoiceProvider()).toBeInstanceOf(BrowserTTSProvider)
  })

  it('returns ElevenLabsProvider when VOICE_PROVIDER is elevenlabs', async () => {
    vi.stubEnv('NEXT_PUBLIC_VOICE_PROVIDER', 'elevenlabs')
    const { createVoiceProvider } = await import('@/lib/voice/index')
    const { ElevenLabsProvider } = await import('@/lib/voice/elevenlabs')
    expect(createVoiceProvider()).toBeInstanceOf(ElevenLabsProvider)
  })

  it('defaults to BrowserTTSProvider when env var not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_VOICE_PROVIDER', '')
    const { createVoiceProvider } = await import('@/lib/voice/index')
    const { BrowserTTSProvider } = await import('@/lib/voice/browser-tts')
    expect(createVoiceProvider()).toBeInstanceOf(BrowserTTSProvider)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/lib/voice/index.test.ts
```

Expected: FAIL

**Step 3: Implement voice abstraction**

Create `lib/voice/types.ts`:
```typescript
export interface VoiceProvider {
  speak(text: string): Promise<void>
  stop(): void
}
```

Create `lib/voice/browser-tts.ts`:
```typescript
import type { VoiceProvider } from './types'

export class BrowserTTSProvider implements VoiceProvider {
  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') { resolve(); return }
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'de-DE'
      utterance.rate = 1.0
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
  }

  stop(): void {
    if (typeof window !== 'undefined') {
      window.speechSynthesis.cancel()
    }
  }
}
```

Create `lib/voice/elevenlabs.ts`:
```typescript
import type { VoiceProvider } from './types'

export class ElevenLabsProvider implements VoiceProvider {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null

  async speak(text: string): Promise<void> {
    const response = await fetch('/api/voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      // Fallback to browser TTS on error
      const { BrowserTTSProvider } = await import('./browser-tts')
      return new BrowserTTSProvider().speak(text)
    }

    const audioBuffer = await response.arrayBuffer()
    this.audioContext = new AudioContext()
    const decoded = await this.audioContext.decodeAudioData(audioBuffer)
    this.currentSource = this.audioContext.createBufferSource()
    this.currentSource.buffer = decoded
    this.currentSource.connect(this.audioContext.destination)

    return new Promise((resolve) => {
      this.currentSource!.onended = () => resolve()
      this.currentSource!.start()
    })
  }

  stop(): void {
    this.currentSource?.stop()
    this.audioContext?.close()
  }
}
```

Create `lib/voice/index.ts`:
```typescript
import type { VoiceProvider } from './types'

export function createVoiceProvider(): VoiceProvider {
  const provider = process.env.NEXT_PUBLIC_VOICE_PROVIDER ?? 'browser'
  if (provider === 'elevenlabs') {
    const { ElevenLabsProvider } = require('./elevenlabs')
    return new ElevenLabsProvider()
  }
  const { BrowserTTSProvider } = require('./browser-tts')
  return new BrowserTTSProvider()
}

export type { VoiceProvider }
```

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

**Step 4: Run tests to verify they pass**

```bash
npm run test:run tests/lib/voice/index.test.ts
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add lib/voice/ app/api/voice/ tests/lib/voice/
git commit -m "feat: add voice abstraction (browser TTS + ElevenLabs)"
```

---

## Task 10: Active Training Session

> **REQUIRED SKILL:** Invoke `frontend-design` skill before writing the page. Prompt: "Active training session screen for PhysioBot PWA — full-screen immersive view, current exercise name large and centered, big countdown timer or rep counter, phase indicator, motivating 'Weiter' button at bottom. Dark or semi-dark background to feel focused. iPhone-optimized."

**Files:**
- Create: `app/training/session/page.tsx`
- Create: `components/training/SessionPlayer.tsx`
- Create: `tests/components/training/SessionPlayer.test.tsx`

**Step 1: Write failing tests**

Create `tests/components/training/SessionPlayer.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import SessionPlayer from '@/components/training/SessionPlayer'
import type { Exercise } from '@/lib/types'

const exercises: Exercise[] = [
  { name: 'Katzenbuckel', description: 'Rücken mobilisieren', phase: 'warmup',
    duration_seconds: 30, voice_script: 'Mobilisiere jetzt deinen Rücken!' },
  { name: 'Brücke', description: 'Gesäß heben', phase: 'main',
    repetitions: 10, sets: 3, voice_script: 'Hebe das Gesäß!' },
]

describe('SessionPlayer', () => {
  it('shows first exercise name', () => {
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} speak={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByText('Katzenbuckel')).toBeInTheDocument()
  })

  it('shows next exercise on next button click', async () => {
    const user = userEvent.setup()
    render(<SessionPlayer exercises={exercises} onComplete={vi.fn()} speak={vi.fn().mockResolvedValue(undefined)} />)
    await user.click(screen.getByRole('button', { name: /weiter/i }))
    expect(screen.getByText('Brücke')).toBeInTheDocument()
  })

  it('calls onComplete after last exercise', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<SessionPlayer exercises={exercises} onComplete={onComplete} speak={vi.fn().mockResolvedValue(undefined)} />)
    await user.click(screen.getByRole('button', { name: /weiter/i }))
    await user.click(screen.getByRole('button', { name: /abschließen/i }))
    expect(onComplete).toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/components/training/SessionPlayer.test.tsx
```

Expected: FAIL

**Step 3: Implement SessionPlayer**

Create `components/training/SessionPlayer.tsx`:
```typescript
'use client'
import { useState, useEffect } from 'react'
import type { Exercise } from '@/lib/types'

interface Props {
  exercises: Exercise[]
  onComplete: () => void
  speak: (text: string) => Promise<void>
}

export default function SessionPlayer({ exercises, onComplete, speak }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const isLast = currentIndex === exercises.length - 1
  const current = exercises[currentIndex]

  useEffect(() => {
    speak(current.voice_script)
    if (current.duration_seconds) {
      setTimeLeft(current.duration_seconds)
    } else {
      setTimeLeft(null)
    }
  }, [currentIndex])

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    const timer = setTimeout(() => setTimeLeft(t => (t ?? 1) - 1), 1000)
    return () => clearTimeout(timer)
  }, [timeLeft])

  const handleNext = () => {
    if (isLast) {
      onComplete()
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  const PHASE_LABELS = { warmup: 'Aufwärmen', main: 'Hauptteil', cooldown: 'Cooldown' }

  return (
    <div className="min-h-screen flex flex-col p-4 max-w-md mx-auto">
      <div className="text-sm text-gray-500 mb-2">
        {currentIndex + 1} / {exercises.length} — {PHASE_LABELS[current.phase]}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        <h2 className="text-3xl font-bold text-center">{current.name}</h2>
        <p className="text-gray-600 text-center">{current.description}</p>

        {timeLeft !== null && (
          <div className="text-6xl font-mono font-bold text-blue-600">{timeLeft}s</div>
        )}

        {current.repetitions && current.sets && (
          <div className="text-2xl font-semibold text-blue-600">
            {current.sets} × {current.repetitions} Wdh.
          </div>
        )}
      </div>

      <button
        onClick={handleNext}
        className="w-full rounded-lg bg-blue-600 py-4 text-white font-semibold text-lg mt-4"
      >
        {isLast ? 'Abschließen' : 'Weiter'}
      </button>
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:run tests/components/training/SessionPlayer.test.tsx
```

Expected: PASS (3 tests)

**Step 5: Create training session page**

Create `app/training/session/page.tsx`:
```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createVoiceProvider } from '@/lib/voice'
import SessionPlayer from '@/components/training/SessionPlayer'
import type { Exercise } from '@/lib/types'

export default function TrainingSessionPage() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [sessionId, setSessionId] = useState<string>()
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const voice = createVoiceProvider()

  useEffect(() => {
    loadPlan()
  }, [])

  const loadPlan = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('active_plan_id')
      .eq('id', user.id)
      .single()

    if (!profile?.active_plan_id) { router.push('/dashboard'); return }

    const { data: plan } = await supabase
      .from('training_plans')
      .select('exercises')
      .eq('id', profile.active_plan_id)
      .single()

    if (!plan) { router.push('/dashboard'); return }

    // Create session record
    const { data: session } = await supabase
      .from('sessions')
      .insert({ plan_id: profile.active_plan_id, user_id: user.id })
      .select()
      .single()

    setSessionId(session?.id)
    setExercises(plan.exercises as Exercise[])
    setIsLoading(false)
  }

  const handleComplete = async () => {
    voice.stop()
    router.push(`/training/feedback?session=${sessionId}`)
  }

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div>Training wird geladen...</div>
      </main>
    )
  }

  return (
    <SessionPlayer
      exercises={exercises}
      onComplete={handleComplete}
      speak={(text) => voice.speak(text)}
    />
  )
}
```

**Step 6: Commit**

```bash
git add app/training/session/ components/training/SessionPlayer.tsx tests/components/training/SessionPlayer.test.tsx
git commit -m "feat: add active training session with voice coach"
```

---

## Task 11: Post-Session Feedback & Plan Adjustment

> **REQUIRED SKILL:** Invoke `frontend-design` skill before writing the page. Prompt: "Post-session feedback screen for PhysioBot PWA — list of exercises with emoji difficulty rating buttons (too easy / right / too hard / painful). Clean, quick to fill in. Celebratory completion feel. Submit button triggers plan adjustment."

**Files:**
- Create: `app/training/feedback/page.tsx`
- Create: `app/api/feedback/route.ts`
- Create: `tests/api/feedback.test.ts`

**Step 1: Write failing test**

Create `tests/api/feedback.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildFeedbackPrompt } from '@/lib/claude/prompts'
import type { SessionFeedback } from '@/lib/types'

describe('buildFeedbackPrompt', () => {
  it('includes painful exercises in prompt', () => {
    const feedback: SessionFeedback[] = [
      { exercise_id: '1', difficulty: 'painful', notes: 'Knie schmerzt' },
    ]
    const prompt = buildFeedbackPrompt(feedback)
    expect(prompt).toContain('painful')
    expect(prompt).toContain('Knie schmerzt')
  })

  it('includes too_hard exercises', () => {
    const feedback: SessionFeedback[] = [
      { exercise_id: '2', difficulty: 'too_hard' },
    ]
    const prompt = buildFeedbackPrompt(feedback)
    expect(prompt).toContain('too_hard')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/api/feedback.test.ts
```

Expected: FAIL

**Step 3: Add `buildFeedbackPrompt` to prompts**

Add to `lib/claude/prompts.ts`:
```typescript
export function buildFeedbackPrompt(feedback: import('@/lib/types').SessionFeedback[]): string {
  const lines = feedback.map(f =>
    `- Übung ${f.exercise_id}: ${f.difficulty}${f.notes ? ` (${f.notes})` : ''}`
  )
  return `Der Nutzer hat folgendes Feedback zur letzten Trainingseinheit gegeben:\n${lines.join('\n')}

Bitte passe den Trainingsplan entsprechend an:
- Bei "painful": Übung durch eine sanftere Alternative ersetzen
- Bei "too_hard": Intensität reduzieren (weniger Wdh., kürzere Dauer)
- Bei "too_easy": Intensität erhöhen
- Bei "right": Übung beibehalten

Antworte mit dem aktualisierten Plan im gleichen JSON-Format wie zuvor.`
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run tests/api/feedback.test.ts
```

Expected: PASS (2 tests)

**Step 5: Create feedback page**

Create `app/training/feedback/page.tsx`:
```typescript
'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { SessionFeedback } from '@/lib/types'

const DIFFICULTY_OPTIONS = [
  { value: 'too_easy', label: 'Zu leicht', emoji: '😴' },
  { value: 'right', label: 'Genau richtig', emoji: '✅' },
  { value: 'too_hard', label: 'Zu schwer', emoji: '😤' },
  { value: 'painful', label: 'Schmerzhaft', emoji: '🛑' },
] as const

function FeedbackForm() {
  const [feedbacks, setFeedbacks] = useState<SessionFeedback[]>([])
  const [exercises, setExercises] = useState<{ name: string; index: number }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  useEffect(() => {
    loadExercises()
  }, [])

  const loadExercises = async () => {
    if (!sessionId) return
    const supabase = createClient()
    const { data: session } = await supabase
      .from('sessions')
      .select('plan_id')
      .eq('id', sessionId)
      .single()
    if (!session) return

    const { data: plan } = await supabase
      .from('training_plans')
      .select('exercises')
      .eq('id', session.plan_id)
      .single()
    if (!plan) return

    const exs = (plan.exercises as { name: string }[]).map((e, i) => ({ name: e.name, index: i }))
    setExercises(exs)
    setFeedbacks(exs.map(e => ({ exercise_id: String(e.index), difficulty: 'right' })))
  }

  const updateFeedback = (index: number, difficulty: SessionFeedback['difficulty']) => {
    setFeedbacks(prev => prev.map((f, i) => i === index ? { ...f, difficulty } : f))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, feedback: feedbacks }),
    })
    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto pt-8">
      <h1 className="text-2xl font-bold mb-6">Wie war das Training?</h1>
      <div className="space-y-4">
        {exercises.map((ex, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-4 space-y-2">
            <div className="font-medium">{ex.name}</div>
            <div className="flex gap-2 flex-wrap">
              {DIFFICULTY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateFeedback(i, opt.value)}
                  className={`rounded-full px-3 py-1 text-sm border ${
                    feedbacks[i]?.difficulty === opt.value
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full mt-6 rounded-lg bg-blue-600 py-3 text-white font-semibold disabled:opacity-50"
      >
        {isSubmitting ? 'Plan wird angepasst...' : 'Feedback senden & Plan anpassen'}
      </button>
    </main>
  )
}

export default function FeedbackPage() {
  return <Suspense><FeedbackForm /></Suspense>
}
```

**Step 6: Create feedback API route**

Create `app/api/feedback/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { anthropic } from '@/lib/claude/client'
import { buildSystemPrompt, buildFeedbackPrompt } from '@/lib/claude/prompts'
import type { SessionFeedback, UserPersonality, Exercise } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, feedback } = await request.json() as {
    sessionId: string
    feedback: SessionFeedback[]
  }

  // Save feedback to session
  await supabase
    .from('sessions')
    .update({ feedback, completed_at: new Date().toISOString() })
    .eq('id', sessionId)

  // Get current plan + user context
  const [{ data: personality }, { data: session }] = await Promise.all([
    supabase.from('user_personality').select('*').eq('user_id', user.id).single(),
    supabase.from('sessions').select('plan_id').eq('id', sessionId).single(),
  ])

  if (!personality || !session) return NextResponse.json({ ok: true })

  const { data: plan } = await supabase
    .from('training_plans')
    .select('exercises')
    .eq('id', session.plan_id)
    .single()

  if (!plan) return NextResponse.json({ ok: true })

  const systemPrompt = buildSystemPrompt({
    personality: personality as UserPersonality,
    memories: [],
  })

  const currentExercisesJson = JSON.stringify({ exercises: plan.exercises })
  const feedbackPrompt = buildFeedbackPrompt(feedback)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Aktueller Plan:\n${currentExercisesJson}\n\n${feedbackPrompt}` },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response')

    const updatedPlan = JSON.parse(content.text) as { exercises: Exercise[] }

    // Create new plan version
    const { data: newPlan } = await supabase
      .from('training_plans')
      .insert({
        assigned_to: user.id,
        created_by: user.id,
        source: 'ai',
        exercises: updatedPlan.exercises,
      })
      .select()
      .single()

    if (newPlan) {
      await supabase
        .from('profiles')
        .update({ active_plan_id: newPlan.id })
        .eq('id', user.id)
    }
  } catch (err) {
    console.error('Plan adjustment failed:', err)
  }

  return NextResponse.json({ ok: true })
}
```

**Step 7: Commit**

```bash
git add app/training/feedback/ app/api/feedback/ tests/api/
git commit -m "feat: add post-session feedback and automatic plan adjustment"
```

---

## Task 12: Mem0 Integration

**Files:**
- Modify: `app/api/generate-plan/route.ts`
- Modify: `app/api/feedback/route.ts`
- Create: `lib/mem0.ts`
- Create: `tests/lib/mem0.test.ts`

**Step 1: Write failing test**

Create `tests/lib/mem0.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('mem0ai', () => ({
  default: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue([
      { memory: 'Nutzer hat Knieschmerzen links', score: 0.95 }
    ]),
  })),
}))

describe('getRelevantMemories', () => {
  it('returns memory strings from search results', async () => {
    const { getRelevantMemories } = await import('@/lib/mem0')
    const memories = await getRelevantMemories('user-123', 'Knieschmerzen')
    expect(memories).toContain('Nutzer hat Knieschmerzen links')
  })
})

describe('addMemory', () => {
  it('calls mem0 add with user_id', async () => {
    const { addMemory } = await import('@/lib/mem0')
    await expect(addMemory('user-123', 'Neues Feedback')).resolves.not.toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run tests/lib/mem0.test.ts
```

Expected: FAIL

**Step 3: Implement Mem0 wrapper**

Create `lib/mem0.ts`:
```typescript
import MemoryClient from 'mem0ai'

// Mem0 uses Supabase pgvector as backend — configure via environment
const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY,
})

// If using self-hosted Mem0 with Supabase:
// const mem0 = new MemoryClient({
//   vector_store: {
//     provider: 'supabase',
//     config: {
//       connection_string: process.env.SUPABASE_DB_URL,
//       collection_name: 'user_memories',
//     }
//   }
// })

export async function addMemory(userId: string, content: string): Promise<void> {
  await mem0.add([{ role: 'user', content }], { user_id: userId })
}

export async function getRelevantMemories(userId: string, query: string): Promise<string[]> {
  const results = await mem0.search(query, { user_id: userId, limit: 8 })
  return results.map((r: { memory: string }) => r.memory)
}

export async function extractAndStoreMemories(
  userId: string,
  sessionSummary: string
): Promise<void> {
  await addMemory(userId, sessionSummary)
}
```

Add `MEM0_API_KEY=your-mem0-key` to `.env.local` and `.env.example`.

Note: Get Mem0 API key from https://mem0.ai — free tier available.

**Step 4: Run test to verify it passes**

```bash
npm run test:run tests/lib/mem0.test.ts
```

Expected: PASS (2 tests)

**Step 5: Integrate Mem0 into plan generation**

In `app/api/generate-plan/route.ts`, replace the manual memory fetch with Mem0:

```typescript
// Replace this block:
// const { data: memories } = await supabase...
// const memoryTexts = (memories ?? []).map(m => m.memory)

// With:
import { getRelevantMemories } from '@/lib/mem0'
// ...
const memoryTexts = await getRelevantMemories(
  user.id,
  `Physiotherapie Training ${healthProfile.complaints.join(' ')}`
).catch(() => []) // graceful fallback if Mem0 unavailable
```

**Step 6: Store session feedback as memory in feedback route**

In `app/api/feedback/route.ts`, after saving the session feedback, add:

```typescript
import { extractAndStoreMemories } from '@/lib/mem0'

// After: await supabase.from('sessions').update(...)
const painfulExercises = feedback.filter(f => f.difficulty === 'painful')
if (painfulExercises.length > 0) {
  const summary = `Session-Feedback: Schmerzhafte Übungen: ${painfulExercises.map(f => f.notes ?? f.exercise_id).join(', ')}`
  await extractAndStoreMemories(user.id, summary).catch(console.error)
}
```

**Step 7: Commit**

```bash
git add lib/mem0.ts tests/lib/mem0.test.ts app/api/generate-plan/route.ts app/api/feedback/route.ts
git commit -m "feat: integrate Mem0 for progressive user memory"
```

---

## Task 13: PWA Configuration

**Files:**
- Modify: `next.config.ts`
- Create: `public/manifest.json`
- Create: `public/icons/` (placeholder icons)

**Step 1: Install next-pwa**

```bash
npm install next-pwa
npm install --save-dev @types/next-pwa
```

**Step 2: Update next.config.ts**

```typescript
import withPWA from 'next-pwa'

const config = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
})

export default config({
  // any existing Next.js config here
})
```

**Step 3: Create web manifest**

Create `public/manifest.json`:
```json
{
  "name": "PhysioBot",
  "short_name": "PhysioBot",
  "description": "Dein AI-Physiotherapie-Coach",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563EB",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Step 4: Add manifest link to app/layout.tsx**

In `app/layout.tsx`, add to the `<head>`:
```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PhysioBot',
  description: 'Dein AI-Physiotherapie-Coach',
  manifest: '/manifest.json',
  themeColor: '#2563EB',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PhysioBot',
  },
}
```

**Step 5: Create placeholder icons**

Create two simple PNG icons (192x192 and 512x512) — use any online icon generator or a simple blue square for now. Place them in `public/icons/`.

**Step 6: Build and verify PWA**

```bash
npm run build && npm start
```

On iPhone: open in Safari → Share → "Zum Home-Bildschirm". Expected: App installs with PhysioBot icon.

**Step 7: Commit**

```bash
git add next.config.ts public/manifest.json public/icons/
git commit -m "feat: configure PWA for iPhone home screen installation"
```

---

## Task 14: Knowledge RAG Placeholder

**Files:**
- Create: `lib/knowledge-rag.ts`

**Step 1: Create placeholder knowledge RAG module**

Create `lib/knowledge-rag.ts`:
```typescript
// Knowledge RAG — Physiotherapy domain knowledge retrieval
// Status: PLACEHOLDER — table exists in DB, not yet populated
// To activate: populate knowledge_chunks table with physio content
// and call getRelevantKnowledge() in lib/claude/prompts.ts [4]

export async function getRelevantKnowledge(
  _query: string
): Promise<string[]> {
  // TODO: implement Supabase pgvector similarity search against knowledge_chunks
  // const supabase = createClient()
  // const embedding = await generateEmbedding(query)
  // const { data } = await supabase.rpc('match_knowledge', { query_embedding: embedding, match_count: 5 })
  // return data?.map(d => d.content) ?? []
  return []
}
```

**Step 2: Commit**

```bash
git add lib/knowledge-rag.ts
git commit -m "chore: add knowledge RAG placeholder for future physio domain knowledge"
```

---

## Task 15: Deploy to Vercel

**Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/physiobot.git
git push -u origin main
```

**Step 2: Deploy via Vercel**

1. Go to https://vercel.com → Import Project → select your GitHub repo
2. Add all environment variables from `.env.local`
3. Deploy

Expected: App live at `https://physiobot-xxx.vercel.app`

**Step 3: Test on iPhone**

Open the Vercel URL in Safari on iPhone → Share → "Zum Home-Bildschirm". Verify full flow: register → onboarding → plan generation → training session → feedback.

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: production deployment ready"
```

---

## Post-MVP Checklist (not in scope)

- [ ] Physio role + patient assignment screens
- [ ] Knowledge RAG population (physio content ingestion pipeline)
- [ ] Progress dashboard (session history, frequency visualization)
- [ ] Data export + deletion (DSGVO)
- [ ] AWS Bedrock EU migration (swap `anthropic` client for Bedrock)
- [ ] Push notification reminders (training time)
- [ ] ElevenLabs voice fine-tuning (custom Tony Robbins-style voice)
