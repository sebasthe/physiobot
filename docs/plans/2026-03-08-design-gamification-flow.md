# PhysioCoach Design, Gamification & Flow Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete visual redesign from dark/amber to warm teal design system + gamification (XP, levels, badges, streaks) + Dr. Mia coach persona + new screens (Home, Plan, Voice Session, Session Done, Schedule Setup) + Mem0-powered memory.

**Architecture:** The existing Next.js 15 / Supabase / ElevenLabs TTS stack stays. Gamification data (streaks, XP events, badges, schedule) goes into Supabase. All unstructured memory (what Dr. Mia knows about the person) goes into **Mem0** — `lib/mem0.ts` already exists and is wired. We rebuild all UI screens to match the HTML prototypes in `/Users/sebastian/Downloads/files/`.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v4, Supabase, ElevenLabs TTS, Mem0, Fraunces + DM Sans fonts

---

## Design Reference Files

HTML prototypes at `/Users/sebastian/Downloads/files/`:
- `physio-app-emotional.html` — Home + Session Done (**highest priority**)
- `physio-voice-session.html` — Pre-Session + Active + Listening (**highest priority**)
- `physio-app-gamified.html` — Home + Plan (gamified)
- `physio-app-template.html` — Profil-Setup + Plan (base design)

**When in doubt: the HTML templates win over this document.**

---

## Architecture Decision: Mem0 vs Custom DB

The briefing explicitly states:

> `user_memory + session_transcripts` tables are **removed completely**.
> Memory is managed by Mem0. Supabase only holds structured game data.

```
Supabase:  streak, xp, badges, sessions, exercise_plans, schedules, users
Mem0:      everything Dr. Mia knows about the person (not the game data)
```

The existing `lib/mem0.ts` already has `addMemory()` and `getRelevantMemories()`. We will enhance it for:
- Full session transcript upload (array of messages, not just a summary string)
- Multi-query session context retrieval
- Immutable kern_motivation storage

---

## Task 1: Design System — Fonts

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Replace fonts**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Fraunces, DM_Sans } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['300', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
})

const dmSans = DM_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PhysioCoach',
  description: 'Dein AI-Physiotherapie-Coach',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'PhysioCoach' },
  other: { 'mobile-web-app-capable': 'yes' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      {/* NOTE: no className="dark" — this is a light theme */}
      <head>
        <meta name="theme-color" content="#1D7A6A" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className={`${fraunces.variable} ${dmSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

**Step 2: Verify**

Run: `npm run dev`
Expected: App loads, no font errors

**Step 3: Commit**
```bash
git add app/layout.tsx
git commit -m "feat: replace fonts with Fraunces + DM Sans per design briefing"
```

---

## Task 2: Design System — CSS Tokens & Global Styles

**Files:**
- Modify: `app/globals.css`

**Step 1: Replace the full `:root` block and global utility styles**

The new design is **light/warm** — not dark. Remove old dark amber tokens entirely.

```css
/* app/globals.css — replace :root and all custom utility classes */

:root {
  --radius: 0.75rem;

  /* Core */
  --background:        #FFFBF5;   /* warm white — NOT pure white */
  --foreground:        #1C1917;
  --card:              #FFFFFF;
  --card-foreground:   #1C1917;
  --popover:           #FFFFFF;
  --popover-foreground: #1C1917;

  /* Brand — Teal (primary) */
  --teal:              #1D7A6A;
  --teal-mid:          #3BB89A;
  --teal-light:        #EAF4F1;

  /* Brand — Accents */
  --peach:             #F0724A;   /* voice listening state, energy */
  --peach-light:       #FEF0EB;
  --gold:              #E8A830;   /* XP, badges */
  --gold-light:        #FBF5E6;
  --lavender:          #7B68EE;   /* insight cards */
  --lavender-light:    #F0EFFE;

  /* Neutrals */
  --bg-dark:           #0F1F1C;   /* voice session background */
  --sand:              #F5EFE6;
  --border:            #EDE8E0;

  /* Text */
  --text-primary:      #1C1917;
  --text-secondary:    #6B6560;
  --text-muted:        #A89F97;

  /* Shadows */
  --shadow-sm:  0 2px 8px rgba(0,0,0,0.05);
  --shadow-md:  0 6px 24px rgba(0,0,0,0.08);
  --shadow-lg:  0 16px 48px rgba(0,0,0,0.12);

  /* Radius */
  --radius-lg:   20px;
  --radius-md:   12px;
  --radius-pill: 999px;

  /* Semantic aliases for shadcn compatibility */
  --primary:           var(--teal);
  --primary-foreground: #FFFFFF;
  --secondary:         var(--teal-light);
  --secondary-foreground: var(--teal);
  --muted:             var(--sand);
  --muted-foreground:  var(--text-muted);
  --accent:            var(--teal-light);
  --accent-foreground: var(--teal);
  --destructive:       #E85D5D;
  --input:             #FFFFFF;
  --ring:              var(--teal);

  /* App shell */
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);

  /* Sidebar (shadcn) */
  --sidebar:              #FFFFFF;
  --sidebar-foreground:   #1C1917;
  --sidebar-primary:      var(--teal);
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent:       var(--teal-light);
  --sidebar-accent-foreground: var(--teal);
  --sidebar-border:       var(--border);
  --sidebar-ring:         var(--teal);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-body), 'DM Sans', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Typography ── */
.font-display {
  font-family: var(--font-display), 'Fraunces', serif;
}

/* ── Buttons ── */
.btn-primary {
  background: var(--teal);
  color: white;
  font-family: var(--font-body), sans-serif;
  font-weight: 700;
  transition: all 0.18s;
  box-shadow: 0 6px 18px rgba(29,122,106,0.3);
}
.btn-primary:hover  { background: #165f54; }
.btn-primary:active { transform: scale(0.98); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Exercise card ── */
.exercise-card {
  background: var(--card);
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--border);
  box-shadow: var(--shadow-sm);
  transition: all 0.18s;
}
.exercise-card.done {
  border-color: var(--teal-light);
  background: var(--teal-light);
}

/* ── Animations ── */
@keyframes popIn {
  from { opacity: 0; transform: scale(0.85) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes floatBob {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-8px); }
}
@keyframes waveOut {
  0%   { transform: translate(-50%,-50%) scale(1); opacity: 0.6; }
  100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
}
@keyframes barDance {
  from { transform: scaleY(0.4); }
  to   { transform: scaleY(1); }
}
@keyframes shimmer {
  to { left: 160%; }
}
@keyframes bounceIn {
  from { opacity: 0; transform: scale(0.6); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ringPulse {
  0%, 100% { opacity: 0.3; transform: translate(-50%,-50%) scale(1); }
  50%       { opacity: 0.7; transform: translate(-50%,-50%) scale(1.04); }
}
@keyframes fall {
  0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}
@keyframes pulseTrophy {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.3); }
  50%       { box-shadow: 0 0 0 16px rgba(255,255,255,0); }
}
@keyframes rwDance {
  0%, 100% { height: 4px; }
  50%       { height: 32px; }
}
```

**Step 2: Verify app loads with warm white background**

Run: `npm run dev` — background should be `#FFFBF5`, no dark mode.

**Step 3: Commit**
```bash
git add app/globals.css
git commit -m "feat: design system — warm teal light theme, full CSS token + animation library"
```

---

## Task 3: Database Migration — Gamification Tables

**Files:**
- Create: `supabase/migrations/20260308_gamification.sql`

**Step 1: Write migration**

This migration adds the gamification layer. It does **not** add memory tables — those belong to Mem0.

```sql
-- ── Gamification fields on profiles ──────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS name  TEXT;

-- ── Streaks (separate table per briefing schema) ──────────────────────
CREATE TABLE IF NOT EXISTS public.streaks (
  user_id      UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current      INTEGER NOT NULL DEFAULT 0,
  longest      INTEGER NOT NULL DEFAULT 0,
  last_session DATE,
  freeze_days  INTEGER NOT NULL DEFAULT 0
);

-- ── XP events (audit log) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.xp_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Badges earned ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.badges_earned (
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_key  TEXT NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

-- ── Schedules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedules (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  days        INTEGER[] NOT NULL DEFAULT '{1,3,5}',  -- 0=Sun … 6=Sat
  notify_time TIME NOT NULL DEFAULT '07:30',
  timezone    TEXT NOT NULL DEFAULT 'Europe/Berlin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.streaks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges_earned  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own streak"
  ON public.streaks FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users read own XP events"
  ON public.xp_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service inserts XP events"
  ON public.xp_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own badges"
  ON public.badges_earned FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users manage own schedule"
  ON public.schedules FOR ALL USING (auth.uid() = user_id);
```

**Step 2: Apply migration**

Run: `npx supabase db push`
Expected: Tables created, no errors

**Step 3: Update TypeScript types in `lib/types.ts`**

Add:
```typescript
export const XP_PER_PHASE = {
  warmup:   10,
  main:     20,
  cooldown: 10,
} as const

export const LEVELS = [
  { level: 1, min: 0,    max: 200,  title: 'Bewegungsstarter' },
  { level: 2, min: 200,  max: 400,  title: 'Körperbewusst' },
  { level: 3, min: 400,  max: 650,  title: 'Ausdauernder' },
  { level: 4, min: 650,  max: 1000, title: 'Bewegungstalent' },
  { level: 5, min: 1000, max: 1500, title: 'Körpermeister' },
  { level: 6, min: 1500, max: Infinity, title: 'Physio-Champion' },
] as const

export function getLevelInfo(xp: number) {
  return LEVELS.find(l => xp >= l.min && xp < l.max) ?? LEVELS[LEVELS.length - 1]
}

export interface Streak {
  current: number
  longest: number
  last_session: string | null
  freeze_days: number
}

export interface BadgeKey {
  key: string
  name: string
  emoji: string
  description: string
}

export const ALL_BADGES: BadgeKey[] = [
  { key: 'first_step',    emoji: '🔥', name: 'Erster Schritt',  description: 'Erste Session abgeschlossen' },
  { key: 'week_hero',     emoji: '💪', name: '7-Tage-Held',     description: '7 Tage Streak' },
  { key: 'neck_pro',      emoji: '🎯', name: 'Nacken-Profi',    description: '10× Nacken-Plan' },
  { key: 'body_master',   emoji: '🏆', name: 'Körpermeister',   description: 'Level 5 erreicht' },
  { key: 'energy_source', emoji: '⚡', name: 'Energiequelle',   description: '1000 XP gesamt' },
  { key: 'morning_person',emoji: '🌙', name: 'Morgenmensch',    description: '7 Sessions vor 9 Uhr' },
  { key: 'comeback_kid',  emoji: '🔄', name: 'Comeback-Kid',    description: 'Nach Pause zurückgekehrt' },
  { key: 'month_pro',     emoji: '💎', name: 'Monats-Profi',    description: '30 Tage Streak' },
]

export interface Schedule {
  days: number[]       // 0=Sun … 6=Sat
  notify_time: string  // "07:30"
  timezone: string
}
```

**Step 4: Commit**
```bash
git add supabase/migrations/20260308_gamification.sql lib/types.ts
git commit -m "feat: gamification DB schema — streaks, xp_events, badges_earned, schedules"
```

---

## Task 4: Enhance Mem0 Integration

**Files:**
- Modify: `lib/mem0.ts`

**Step 1: Read current file**

Current `lib/mem0.ts` has `addMemory(string)` and `getRelevantMemories(query)`. We need:
- `addSessionTranscript(messages[])` — full conversation array, not just a string
- `getSessionContext(userId)` — multi-query retrieval for Dr. Mia
- `storeKernMotivation(userId, text)` — immutable kern_motivation

**Step 2: Rewrite `lib/mem0.ts`**

```typescript
import MemoryClient from 'mem0ai'

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY ?? '',
})

type Role = 'user' | 'assistant'
export interface TranscriptMessage {
  role: Role
  content: string
}

// ── Add full session transcript ──────────────────────────────────────
// Mem0 automatically extracts: motivation, life context, personality,
// patterns — no manual extraction job needed.
export async function addSessionTranscript(
  userId: string,
  messages: TranscriptMessage[],
  sessionId?: string
): Promise<void> {
  if (messages.length === 0) return
  await mem0.add(messages, {
    user_id: userId,
    metadata: { sessionId, date: new Date().toISOString() },
  })
}

// ── Store kern_motivation as immutable ───────────────────────────────
// Called after Five Whys conversation is complete (Session 3)
export async function storeKernMotivation(
  userId: string,
  motivation: string
): Promise<void> {
  await mem0.add(
    [{ role: 'user', content: motivation }],
    {
      user_id: userId,
      metadata: {
        category: 'motivation',
        immutable: true,
        source: 'five_whys',
      },
    }
  )
}

// ── Get session context for Dr. Mia ─────────────────────────────────
// Returns compact strings ready to inject into system prompt
export interface SessionMemoryContext {
  kernMotivation: string | null
  personalityHints: string[]
  patternHints: string[]
  lifeContext: string[]
}

export async function getSessionContext(userId: string): Promise<SessionMemoryContext> {
  const [motivation, personality, patterns, life] = await Promise.all([
    mem0.search('core motivation reason for physio treatment Kinder Familie', {
      user_id: userId,
      limit: 1,
    }),
    mem0.search('personality communication style reaction to praise humor', {
      user_id: userId,
      limit: 3,
    }),
    mem0.search('training patterns best time of day dropout triggers', {
      user_id: userId,
      limit: 3,
    }),
    mem0.search('family job hobbies daily life context', {
      user_id: userId,
      limit: 3,
    }),
  ])

  return {
    kernMotivation: motivation.results?.[0]?.memory ?? null,
    personalityHints: personality.results?.map((r: { memory?: string }) => r.memory ?? '').filter(Boolean) ?? [],
    patternHints: patterns.results?.map((r: { memory?: string }) => r.memory ?? '').filter(Boolean) ?? [],
    lifeContext: life.results?.map((r: { memory?: string }) => r.memory ?? '').filter(Boolean) ?? [],
  }
}

// ── Legacy helpers (kept for existing feedback route) ─────────────────
export async function addMemory(userId: string, content: string): Promise<void> {
  await mem0.add([{ role: 'user', content }], { user_id: userId })
}

export async function getRelevantMemories(userId: string, query: string): Promise<string[]> {
  const results = await mem0.search(query, { user_id: userId, limit: 8 })
  return results.map((r: { memory?: string }) => r.memory ?? '').filter(Boolean)
}

export async function extractAndStoreMemories(userId: string, sessionSummary: string): Promise<void> {
  await addMemory(userId, sessionSummary)
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**
```bash
git add lib/mem0.ts
git commit -m "feat: enhance Mem0 — transcript upload, session context retrieval, kern_motivation storage"
```

---

## Task 5: Gamification API — XP + Streak + Badges

**Files:**
- Create: `lib/gamification.ts`
- Create: `app/api/gamification/route.ts`

**Step 1: Create `lib/gamification.ts`**

Uses `streaks`, `xp_events`, `badges_earned` tables (per briefing schema).

```typescript
// lib/gamification.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { XP_PER_PHASE, getLevelInfo } from './types'
import type { Exercise } from './types'

export function calculateSessionXP(exercises: Exercise[], streakActive: boolean): number {
  const base = exercises.reduce((sum, ex) => sum + (XP_PER_PHASE[ex.phase] ?? 10), 0)
  const streakBonus = streakActive ? Math.round(base * 0.2) : 0
  return base + streakBonus + 20  // +20 session completion bonus
}

export interface GamificationResult {
  xpEarned: number
  newXP: number
  newLevel: number
  levelTitle: string
  newStreak: number
  longestStreak: number
  newBadges: string[]
}

export async function updateGamification(
  supabase: SupabaseClient,
  userId: string,
  exercises: Exercise[],
  sessionId?: string
): Promise<GamificationResult> {
  // ── Load current state ────────────────────────────────────────────
  const [{ data: profile }, { data: streak }] = await Promise.all([
    supabase.from('profiles').select('xp, level').eq('id', userId).single(),
    supabase.from('streaks').select('*').eq('user_id', userId).single(),
  ])

  const currentXP = profile?.xp ?? 0
  const currentStreak = streak?.current ?? 0
  const longest = streak?.longest ?? 0

  // ── Streak logic ──────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0]
  const lastDate = streak?.last_session ?? null
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  let newStreak: number
  if (!lastDate) {
    newStreak = 1
  } else if (lastDate === today) {
    newStreak = currentStreak               // already trained today
  } else if (lastDate === yesterday) {
    newStreak = currentStreak + 1           // consecutive day
  } else {
    newStreak = 1                           // streak broken
  }

  const newLongest = Math.max(longest, newStreak)
  const streakActive = lastDate === yesterday || lastDate === today

  // ── XP ────────────────────────────────────────────────────────────
  const xpEarned = calculateSessionXP(exercises, streakActive)
  const newXP = currentXP + xpEarned
  const levelInfo = getLevelInfo(newXP)
  const newLevel = levelInfo.level

  // ── Write to DB ───────────────────────────────────────────────────
  await Promise.all([
    supabase
      .from('profiles')
      .update({ xp: newXP, level: newLevel })
      .eq('id', userId),
    supabase
      .from('streaks')
      .upsert({ user_id: userId, current: newStreak, longest: newLongest, last_session: today }),
    supabase
      .from('xp_events')
      .insert({ user_id: userId, amount: xpEarned, reason: 'session_complete', session_id: sessionId ?? null }),
  ])

  // ── Badge detection ───────────────────────────────────────────────
  const newBadges = await checkAndAwardBadges(supabase, userId, {
    xp: newXP,
    level: newLevel,
    streak: newStreak,
  })

  return {
    xpEarned,
    newXP,
    newLevel,
    levelTitle: levelInfo.title,
    newStreak,
    longestStreak: newLongest,
    newBadges,
  }
}

async function checkAndAwardBadges(
  supabase: SupabaseClient,
  userId: string,
  stats: { xp: number; level: number; streak: number }
): Promise<string[]> {
  const { data: existing } = await supabase
    .from('badges_earned')
    .select('badge_key')
    .eq('user_id', userId)
  const earned = new Set(existing?.map(b => b.badge_key) ?? [])

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
  const sessionCount = sessions?.length ?? 0

  const candidates: string[] = []
  if (sessionCount >= 1   && !earned.has('first_step'))    candidates.push('first_step')
  if (stats.streak >= 7   && !earned.has('week_hero'))     candidates.push('week_hero')
  if (stats.streak >= 30  && !earned.has('month_pro'))     candidates.push('month_pro')
  if (stats.xp >= 1000    && !earned.has('energy_source')) candidates.push('energy_source')
  if (stats.level >= 5    && !earned.has('body_master'))   candidates.push('body_master')

  if (candidates.length > 0) {
    await supabase
      .from('badges_earned')
      .insert(candidates.map(badge_key => ({ user_id: userId, badge_key })))
  }

  return candidates
}
```

**Step 2: Create API route**

```typescript
// app/api/gamification/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateGamification } from '@/lib/gamification'
import type { Exercise } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const exercises: Exercise[] = body.exercises ?? []
  const sessionId: string | undefined = body.sessionId

  const result = await updateGamification(supabase, user.id, exercises, sessionId)
  return NextResponse.json(result)
}
```

**Step 3: Commit**
```bash
git add lib/gamification.ts app/api/gamification/route.ts
git commit -m "feat: gamification API — XP/streak (streaks table), XP events log, badge detection"
```

---

## Task 6: Home Screen Redesign

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/DashboardClient.tsx`
- Create: `components/home/HomeScreen.tsx`

**Reference:** `physio-app-emotional.html` (Phone 1) + `physio-app-gamified.html` (Phone 1)

**Step 1: Update server component to fetch gamification data**

In `app/dashboard/page.tsx`, extend the Supabase queries:

```typescript
// Add to existing queries:
const [{ data: profile }, { data: streak }, { data: badgesEarned }] = await Promise.all([
  supabase.from('profiles').select('active_plan_id, xp, level, name').eq('id', user.id).single(),
  supabase.from('streaks').select('current, longest').eq('user_id', user.id).single(),
  supabase.from('badges_earned').select('badge_key, earned_at').eq('user_id', user.id),
])
```

Pass to DashboardClient: `xp`, `level`, `streak`, `name`, `earnedBadgeKeys[]`.

**Step 2: Create `components/home/HomeScreen.tsx`**

Sections (exact pixel values from HTML template):

**Hero Header** (background: `linear-gradient(135deg, #1D7A6A 0%, #2A9D8A 50%, #3BB89A 100%)`)
```
- 3 decorative blobs (absolute positioned circles, white 5-8% opacity)
- Top row: StreakPill (🔥 X Tage, rgba white bg) | NotificationBell (with peach dot)
- Greeting: Fraunces italic 28px white, dynamic text based on time of day
- Greeting tag: ☀️/🌙 + day/time label
- Sub-text: personalized stat line (text-white 75% opacity)
- XP Strip: icon ⚡ + level name + XP bar with shimmer pseudo-element + "320 XP bis Lv 5"
```

**Floating Stats** (margin-top: -22px, z-index: 2, three equal-width cards)
```tsx
// Three cards: Streak / XP / Badges
// Each: box-shadow shadow-md, radius-md, pop-in animation with 50ms stagger
// fc-emoji (22px) → fc-val (20px bold) → fc-lbl (10px muted uppercase)
```

**Coach Says Card** (bg: `--gold-light`, border: `rgba(232,168,48,0.2)`)
```
- Left: coach avatar circle (42px, gold gradient, 🧑‍⚕️)
- Right: "DR. MIA · DEIN COACH" label (12px gold bold uppercase) + personalized text
- Text uses real data: "Dein Nacken hat sich diese Woche um X% besser bewegt."
- NEVER generic "Gut gemacht!"
```

**Today Card** (gradient: `--peach → #F5A26A`)
```
- Streak-Tag chip: 🔥 Streak-Tag · +Bonus XP
- Title (Fraunces 26px white) + meta (9 Übungen · ~9 Min · +120 XP)
- Progress bar (white on peach) + "3 / 9 erledigt"
- Bottom white panel: coach avatar (34px) + "Weitermachen!" / start button (peach)
```

**Badges Horizontal Scroll** (overflow-x auto, scrollbar hidden)
```
- Earned: gold border, bc-icon in gold-light bg, gold check-dot (position absolute)
- Locked: opacity 0.45
- Show ALL_BADGES, mark earned vs locked based on earnedBadgeKeys[]
```

**Step 3: DashboardClient renders HomeScreen when plan exists**

```tsx
// DashboardClient.tsx — when exercises loaded:
return <HomeScreen
  exercises={exercises}
  xp={gamification.xp}
  level={gamification.level}
  streak={streak.current}
  userName={name ?? 'du'}
  earnedBadgeKeys={earnedBadgeKeys}
  onStartSession={() => router.push('/training/session')}
/>
```

**Step 4: Commit**
```bash
git add app/dashboard/ components/home/
git commit -m "feat: redesign Home Screen — hero gradient, XP strip, stats cards, coach message, badges"
```

---

## Task 7: Plan Screen Redesign (Gamified)

**Files:**
- Modify: `components/training/PlanOverview.tsx`
- Create: `components/training/ExerciseCard.tsx`
- Create: `components/training/XPToast.tsx`

**Reference:** `physio-app-gamified.html` (Phone 2)

**Step 1: Create `XPToast` component**

```tsx
// components/training/XPToast.tsx
'use client'
interface Props { xp: number; visible: boolean }

export default function XPToast({ xp, visible }: Props) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 100,
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
      opacity: visible ? 1 : 0,
      background: '#1C1917',
      color: 'white',
      padding: '10px 20px',
      borderRadius: 28,
      fontSize: 14,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      pointerEvents: 'none',
      transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      whiteSpace: 'nowrap',
      zIndex: 999,
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    }}>
      ⚡ +{xp} XP verdient!
    </div>
  )
}
```

**Step 2: Create `ExerciseCard` component**

```tsx
// components/training/ExerciseCard.tsx
'use client'
import { useState } from 'react'
import { XP_PER_PHASE } from '@/lib/types'
import type { Exercise } from '@/lib/types'

interface Props {
  exercise: Exercise
  onDone: (xp: number) => void  // called when marked done (not on un-done)
}

export default function ExerciseCard({ exercise, onDone }: Props) {
  const [done, setDone] = useState(false)
  const xp = XP_PER_PHASE[exercise.phase] ?? 10

  const toggle = () => {
    const next = !done
    setDone(next)
    if (next) onDone(xp)
  }

  // Render per gamified template:
  // - position: relative, overflow: hidden
  // - ::before left stripe: 3px --teal, only when done
  // - top row: ex-name (600, 15px) | time badge + reps badge + xp pill (gold-light)
  // - description: text-muted 13px
  // - done row (height 0 → 22px transition): green check + "Erledigt" + "+{xp} XP ⚡"
  // - done state: border teal, bg teal-light
}
```

**Step 3: Update PlanOverview**

Replace current plain list with:
- Teal gradient plan header (chips: exercise count, duration, streak tag, XP strip)
- Section headers: Aufwärmen 🔥 / Hauptteil ⚡ / Cooldown 💧 — each with "+X XP" total in gold
- `<ExerciseCard>` per exercise
- `<XPToast>` shown 300ms after tap, hides after 2.2s
- Mini confetti (6 particles) on done — use same `spawnConfetti()` as Session Done
- Training start button at bottom

**Step 4: Commit**
```bash
git add components/training/
git commit -m "feat: gamified Plan Screen — XP pills, interactive done-state, confetti, XP toast"
```

---

## Task 8: Dr. Mia Coach Persona + System Prompt

**Files:**
- Modify: `lib/claude/prompts.ts`

**Step 1: Add Dr. Mia system prompt builder**

```typescript
// lib/claude/prompts.ts — add alongside existing functions:

import type { SessionMemoryContext } from '../mem0'

export function buildDrMiaSystemPrompt(params: {
  userName: string
  streak: number
  bodyAreas: string[]
  memoryContext: SessionMemoryContext
  timeOfDay: 'morning' | 'midday' | 'evening'
  lastSession?: { date: string; duration: number; completedAll: boolean }
  sessionNumber: number
}): string {
  const { userName, streak, bodyAreas, memoryContext, timeOfDay, lastSession, sessionNumber } = params

  const timeLabel = timeOfDay === 'morning' ? 'Morgen (vor 11 Uhr)' :
                    timeOfDay === 'midday'  ? 'Mittag (11–17 Uhr)' : 'Abend'

  const lastSessionText = lastSession
    ? `Letzte Session: ${lastSession.date}, ${lastSession.duration}s, ${lastSession.completedAll ? 'vollständig abgeschlossen' : 'abgebrochen'}.`
    : 'Heute ist die erste Session.'

  const fiveWhysInstruction = sessionNumber <= 3
    ? `
FIVE WHYS (Session ${sessionNumber}/3): Frag heute empathisch nach der Kern-Motivation.
Session 1: W1 "Was hat dich dazu gebracht, heute hier zu sein?" + W2 "Was stört dich im Alltag am meisten?"
Session 2: W3 "Was würde sich ändern wenn das besser wird?" — referenziere Session-1-Antwort.
Session 3: W4+W5 emotionaler Kern, Zukunftsbild. Wenn Kern gefunden: aufhören.
Regeln: Auf Antworten eingehen (nicht stur). Pause nach emotionalen Antworten. NICHT: 5× mechanisch "Warum?" fragen.
Wenn Nutzer blockt: "Kein Problem — lass uns starten." → in nächster Session aufgreifen.`
    : ''

  const motivationLine = memoryContext.kernMotivation
    ? `Kern-Motivation (UNVERÄNDERLICH): "${memoryContext.kernMotivation}" — mindestens 1× pro 2. Session referenzieren.`
    : 'Kern-Motivation: noch nicht bekannt.'

  return `Du bist Dr. Mia, persönlicher Physiotherapie-Coach in der PhysioCoach App.

CHARAKTER: Warm, ehrlich, leicht frech. Gute Freundin die Physio ist.
Immer per Du. Immer Vorname. Kein leeres Lob — wenn du lobst, ist es echt und konkret.
Kurze Sätze. Aktive Sprache. Maximal 2 Sätze am Stück ohne Pause.

PATIENT: ${userName} · Streak: ${streak} Tage · Körperbereiche: ${bodyAreas.join(', ')}
${motivationLine}
${memoryContext.personalityHints.length > 0 ? `Persönlichkeit: ${memoryContext.personalityHints.join('; ')}` : ''}
${memoryContext.lifeContext.length > 0 ? `Lebenskontext: ${memoryContext.lifeContext.join('; ')}` : ''}
${lastSessionText}
Tageszeit: ${timeLabel}

ÜBUNGS-FLOW:
1. Ankündigung: "Okay — jetzt: {Übungsname}."
2. Erklärung (max. 2 Sätze): Ausführung + wichtigster Hinweis
3. Start-Cue: "Und... los."
4. Mittelwert-Kommentar (optional, 1 Satz max.)
5. Abschluss: "{Übungsname} — erledigt." + kurzes echtes Feedback
6. Übergang: "Als nächstes: {nächste Übung}."

AUF FRAGEN: "Nochmal" → Übung wiederholen. "Pause" → "Okay, kurze Pause."
"Stop" → warm verabschieden. Andere Fragen → kurz antworten, Session fortsetzen.

SPRACHE: Immer Deutsch, Du, kurze Sätze, aktiv.${fiveWhysInstruction}`
}
```

**Step 2: Update `getTimeOfDay()` helper**

```typescript
export function getTimeOfDay(): 'morning' | 'midday' | 'evening' {
  const h = new Date().getHours()
  if (h < 11) return 'morning'
  if (h < 17) return 'midday'
  return 'evening'
}
```

**Step 3: Commit**
```bash
git add lib/claude/prompts.ts
git commit -m "feat: Dr. Mia system prompt — Five Whys integration, memory context injection, time-of-day variants"
```

---

## Task 9: Voice Session — Pre-Session Screen

**Files:**
- Create: `components/training/PreSessionScreen.tsx`
- Modify: `app/training/session/page.tsx`

**Reference:** `physio-voice-session.html` Phone 1

**Step 1: Create `PreSessionScreen`**

Design specs:
- Full screen, `background: #0F1F1C` (bg-dark)
- 3 concentric `ringPulse` rings: 260px / 340px / 420px, centered, `border: 1px solid rgba(59,184,154,0.15)`
- Coach orb: 130px, `background: linear-gradient(135deg, #1D7A6A, #3BB89A)`, `floatBob` animation, 🧑‍⚕️ emoji centered (48px)
- Headline: Fraunces italic white — *"Guten Morgen, {name}. Tag {streak}."*
- Session chips: 3 pills — "🔥 +{streakBonus}% XP" + "{count} Übungen" + "⚡ +{xpReward} XP"
- Start button: 72px circle, teal, play icon, `box-shadow: 0 0 0 0 rgba(29,122,106,0.4)` pulsing animation
- Hint text below button: *"Tippen zum Starten — dann Phone weglegen"* (text-muted, 12px)

```tsx
// components/training/PreSessionScreen.tsx
'use client'
interface Props {
  userName: string
  streak: number
  exerciseCount: number
  xpReward: number
  onStart: () => void
}
```

**Step 2: Add pre-session state to `app/training/session/page.tsx`**

```typescript
// Add state: 'loading' | 'pre' | 'active'
// Show PreSessionScreen when state === 'pre'
// loadPlan() sets state to 'pre' on success
// onStart() → voice.speak(greeting) → setState('active')
```

Greeting to speak on start (from Dr. Mia prompt variants):
- Morning: *"Guten Morgen, {name}. Tag {streak}. Dein {bodyArea} hat sich erholt — lass uns das nutzen."*
- Evening: *"Fast vergessen? Macht nichts, {name}. Du bist da — das ist was zählt."*

**Step 3: Commit**
```bash
git add components/training/PreSessionScreen.tsx app/training/session/page.tsx
git commit -m "feat: Pre-Session screen — dark bg, glow rings, coach orb, float animation, start CTA"
```

---

## Task 10: Voice Session — Active Screen (Split Layout)

**Files:**
- Modify: `components/training/SessionPlayer.tsx`

**Reference:** `physio-voice-session.html` Phone 2 (coaching) + Phone 3 (listening)

**Step 1: Redesign the top half (voice area)**

Voice area is the top ~55% of screen:
- Background gradient: `#0A1714 → #0F1F1C` (coach speaking) / `#1A0E0A → #1A1209` (listening)
- Grid pattern: CSS `background-image: repeating-linear-gradient(...)`, 32px, rgba(teal/peach, 0.04)
- Progress dots: one per exercise, pill shape when current
- Coach orb: 100px, teal or peach gradient, 3 `waveOut` rings when speaking
- `barDance` speaking bars (5 bars, staggered delays)
- Transcript bubble: dark bg, live text + blinking cursor
- Mic button: 38px circle, `--peach`

**Step 2: Redesign the bottom half (exercise panel)**

Exercise panel is the bottom ~45%:
- `border-radius: 28px 28px 0 0`, white bg, `box-shadow: 0 -8px 32px rgba(0,0,0,0.3)`
- Handle bar (36×4px, `--border`, centered)
- "Jetzt · Übung X von N" label (teal, uppercase, 11px)
- Exercise name: Fraunces 26px
- Description box: sand bg, 12px text
- Metrics row: countdown timer + reps + total
- Progress ring: 88px SVG (teal stroke, percentage centered)
- "Als nächstes" card: sand bg
- Controls: Nochmal / Pause / Stop (Stop in peach)

**Step 3: Voice state switching**

```typescript
type VoiceState = 'speaking' | 'listening' | 'idle' | 'complete'
// speaking → teal gradient + waveOut + barDance
// listening → peach gradient + listen waves + rwDance waveform
// idle → teal, no animations
// complete → transition to DoneScreen
```

**Step 4: Commit**
```bash
git add components/training/SessionPlayer.tsx
git commit -m "feat: redesign SessionPlayer — split screen, speaking/listening state, exercise panel"
```

---

## Task 11: Session Done Screen + Mem0 Transcript Save

**Files:**
- Create: `components/training/SessionDoneScreen.tsx`
- Modify: `app/training/feedback/page.tsx`

**Reference:** `physio-app-emotional.html` Phone 2

**Step 1: Create `SessionDoneScreen`**

Design specs:
- **Celebration area**: `linear-gradient(160deg, #1D7A6A 0%, #3BB89A 60%, #6FD4C0 100%)` + blob decorations
- **Trophy orb**: 100px, `rgba(255,255,255,0.18)` bg, `border: 3px solid rgba(255,255,255,0.35)`, `pulseTrophy` animation, 🏆 at 48px
- **60 confetti particles** spawned on mount (all brand colors, randomized fall animation)
- **Headline**: Fraunces *"Das war richtig gut, {name}."* — ALWAYS with name
- **Body**: *"9 Minuten. Kein einziger Ausrede."* — never boilerplate
- **XP burst pill**: `⚡ +{xpEarned} XP`, `bounceIn` animation (delay 0.3s)
- **Stats 2×2 grid**: ⏱️ Dauer / 🔥 Streak / ⚡ XP / 💪 Sessions — `fadeUp` stagger
- **"Was das bedeutet" card**: lavender-light bg, 🔮 gradient icon, forward-looking text (*"In 2–3 Wochen..."*)
- **Coach-Reaktion card**: peach-light bg, Dr. Mia comment mentioning tomorrow
- **Actions**: main "🎉 Weiter" (teal) + ghost "Heute nochmal ansehen"

**Step 2: Confetti implementation**

```typescript
function spawnConfetti(): void {
  const colors = ['#1D7A6A','#3BB89A','#E8A830','#F0724A','#7B68EE','#A8F0E0','#F5C842']
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el = document.createElement('div')
      const size = 5 + Math.random() * 8
      el.style.cssText = `
        position:fixed; z-index:999; pointer-events:none;
        left:${10 + Math.random()*80}%; top:-12px;
        width:${size}px; height:${size}px;
        background:${colors[Math.floor(Math.random()*colors.length)]};
        border-radius:${Math.random()>0.4?'50%':'3px'};
        animation:fall ${1.2+Math.random()*1.2}s linear forwards;
      `
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 2600)
    }, i * 28)
  }
}
```

**Step 3: On mount — call gamification API + save transcript to Mem0**

```typescript
// In SessionDoneScreen or feedback page:
useEffect(() => {
  // 1. Trigger gamification update
  fetch('/api/gamification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercises, sessionId }),
  }).then(r => r.json()).then(setGamification)

  // 2. Save session transcript to Mem0 (if transcript available from voice)
  if (sessionTranscript.length > 0) {
    fetch('/api/memory/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: sessionTranscript, sessionId }),
    })
  }

  spawnConfetti()
}, [])
```

**Step 4: Create transcript save API route**

```typescript
// app/api/memory/transcript/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addSessionTranscript } from '@/lib/mem0'
import type { TranscriptMessage } from '@/lib/mem0'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { transcript, sessionId }: { transcript: TranscriptMessage[]; sessionId?: string }
    = await request.json()

  await addSessionTranscript(user.id, transcript, sessionId)
  return NextResponse.json({ ok: true })
}
```

**Step 5: Flow change: DoneScreen before FeedbackForm**

Update `app/training/feedback/page.tsx`:
1. First show `SessionDoneScreen` (celebration, XP burst)
2. After user taps "Weiter" → show existing difficulty `FeedbackForm`
3. After feedback submit → `router.push('/dashboard')`

**Step 6: Commit**
```bash
git add components/training/SessionDoneScreen.tsx app/training/feedback/page.tsx app/api/memory/
git commit -m "feat: Session Done screen — celebration, confetti, XP burst, Mem0 transcript save"
```

---

## Task 12: Schedule Setup Screen

**Files:**
- Create: `app/onboarding/schedule/page.tsx`

**Reference:** Briefing Section 4.1

**Step 1: Create schedule page**

```tsx
// app/onboarding/schedule/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const DEFAULT_DAYS = [1, 3, 5]  // Mon, Wed, Fri

export default function SchedulePage() {
  const [selectedDays, setSelectedDays] = useState<number[]>(DEFAULT_DAYS)
  const [notifyTime, setNotifyTime] = useState('07:30')
  const router = useRouter()

  const toggleDay = (d: number) =>
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])

  const save = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('schedules').upsert({
      user_id: user.id,
      days: selectedDays,
      notify_time: notifyTime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    router.push('/dashboard')
  }

  // Visual design:
  // Eyebrow: "TRAININGSPLAN" (teal, uppercase)
  // Headline: Fraunces — "Wann soll Dr. Mia dich erinnern?"
  // Day chips: 7 pills in a row, selected = teal bg/border, tap to toggle
  // Time input: native <input type="time"> styled to match theme
  // Preset chips: 07:00 / 12:00 / 18:00 / 20:00
  // CTA: "Fertig — Plan starten" (teal button)
  // Skip link: "Später einrichten" (text-muted, routes to /dashboard)
}
```

**Step 2: Redirect from health-profile to schedule**

After successful plan generation, redirect to `/onboarding/schedule` instead of `/dashboard`.

**Step 3: Commit**
```bash
git add app/onboarding/schedule/
git commit -m "feat: Schedule Setup screen — day chips, time picker, saves to schedules table"
```

---

## Task 13: Onboarding Health Profile Redesign

**Files:**
- Read, then modify: `app/onboarding/health-profile/page.tsx`

**Reference:** `physio-app-template.html` Screen 1

**Step 1: Read current file first**

**Step 2: Visual redesign**

Key changes (match template exactly):
- Eyebrow: "DEIN PROFIL" (teal, uppercase, 11px, letter-spacing)
- Headline: Fraunces 36px — "Gesundheits**profil**" (second word segment in teal)
- Coach Banner: teal bg, 🧑‍⚕️ avatar, "Hallo, ich bin Dr. Mia" + subtitle
- Body areas: 3×2 grid — Lucide SVG icons (NOT emoji), selected = teal-light/border
- Goal textarea: warm placeholder, focus ring teal, min-height 90px
- Fitness levels: vertical list, selected = teal-light bg + teal border + teal checkbox with white checkmark
- CTA: "Plan erstellen" with arrow icon (teal button, full width)

**Step 3: Commit**
```bash
git add app/onboarding/health-profile/
git commit -m "feat: redesign Health Profile — coach banner, SVG area grid, fitness radio list"
```

---

## Task 14: Bottom Navigation + AppShell Update

**Files:**
- Create: `components/layout/BottomNav.tsx`
- Modify: `components/layout/AppShell.tsx`

**Step 1: Create BottomNav**

```tsx
// components/layout/BottomNav.tsx
'use client'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Calendar, MessageCircle, User } from 'lucide-react'

const TABS = [
  { icon: Home,          label: 'Home',  href: '/dashboard' },
  { icon: Calendar,      label: 'Plan',  href: '/dashboard/plan' },
  { icon: MessageCircle, label: 'Coach', href: '/dashboard/coach' },
  { icon: User,          label: 'Profil',href: '/dashboard/profil' },
]

// Active tab: bg teal-light, icon stroke teal, label teal 600
// Inactive: bg transparent, icon/label text-muted
// Bottom safe area padding included
```

**Step 2: Hide during voice session**

In `AppShell.tsx`:
```typescript
const pathname = usePathname()
const hideNav = pathname.startsWith('/training/session')
```

**Step 3: Commit**
```bash
git add components/layout/
git commit -m "feat: bottom navigation — 4 tabs, teal active, hidden during voice session"
```

---

## Task 15: Landing Page Redesign

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update to warm teal design**

- Background: `--background` (#FFFBF5)
- Remove dark mode / radial amber glow
- Headline: Fraunces display — "Physio**Coach**" (second part teal)
- Sub: DM Sans, text-secondary
- Coach orb visual (optional, simple teal circle with 🧑‍⚕️)
- CTA: teal "Loslegen" + ghost "Anmelden"

**Step 2: Commit**
```bash
git add app/page.tsx
git commit -m "feat: redesign landing page — warm teal theme, Fraunces headline"
```

---

## Task 16: End-to-End Integration Test

**Step 1: Full user flow walkthrough**

1. Landing → Register → Health Profile → (plan generates) → Schedule Setup → Dashboard
2. Home: check hero gradient, floating stats, coach message, badges scroll
3. Plan: mark exercise done → XP toast 300ms delay → confetti 6 particles → toast disappears 2.2s
4. Training: Pre-Session (glow rings visible, float animation) → Active (split screen, progress dots) → Done (60 confetti, XP burst bounceIn)
5. Feedback → Dashboard (streak/XP updated from `streaks` + `profiles` tables)

**Step 2: Visual regression checks**

- All text on `--bg` (#FFFBF5): must be dark (`--text-primary` #1C1917)
- Fraunces only on headlines (not body text)
- No Bebas Neue or Plus Jakarta Sans remnants (search codebase for old font references)
- Gold XP pills not confused with teal primary (XP = gold, CTAs = teal)

**Step 3: Check Mem0 wiring**

- After a session: verify `mem0.add()` called with transcript
- Before a session: verify `mem0.search()` returns results (if any sessions done)
- Check `MEM0_API_KEY` is set in `.env.local`

**Step 4: Final commit**
```bash
git add -A
git commit -m "feat: complete PhysioCoach redesign — teal design system, gamification, Dr. Mia, Mem0 memory"
```

---

## Implementation Notes

### What stays in Supabase
```
profiles        — id, xp, level, name
health_profiles — complaints, goals, fitness_level
sessions        — plan_id, started_at, ended_at, xp_earned
training_plans  — exercises (JSONB), source
streaks         — current, longest, last_session, freeze_days
xp_events       — amount, reason, session_id
badges_earned   — user_id, badge_key
schedules       — days[], notify_time, timezone
```

### What goes in Mem0
```
Everything Dr. Mia knows about the person:
- kern_motivation (from Five Whys)
- life context (family, job, hobbies)
- personality (reaction to praise, humor level)
- patterns (best training time, dropout risk)
```

### Existing tables to keep but NOT extend
```
user_memories    — old RAG table, still there, not used for new features
user_personality — old personality system, still used by feedback route
```

### Badge Keys Reference
```
first_step    → session count ≥ 1
week_hero     → streak ≥ 7
neck_pro      → tracked separately (plan type detection)
body_master   → level ≥ 5
energy_source → xp ≥ 1000
morning_person → tracked separately (session hour)
comeback_kid  → streak broken then resumed (after gap ≥ 3 days)
month_pro     → streak ≥ 30
```

### Task Parallelization

Backend tasks that can be done in parallel (no shared state):
- Task 4 (Mem0 enhancement)
- Task 5 (Gamification API)
- Task 8 (Dr. Mia prompts)

Must be sequential (UI depends on tokens/CSS):
- Task 1 → Task 2 → all UI tasks (Tasks 6–15)

Must be sequential (API before UI):
- Task 3 (DB) → Task 5 (API) → Task 11 (Done screen calls API)
