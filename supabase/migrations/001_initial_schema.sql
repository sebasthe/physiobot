-- Enable pgvector for RAG
create extension if not exists vector;

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

create table public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  memory text not null,
  embedding vector(1536),
  source text not null default 'inferred' check (source in ('onboarding', 'inferred')),
  created_at timestamptz not null default now()
);
create index on public.user_memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector(1536),
  category text,
  source text,
  created_at timestamptz not null default now()
);
create index on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table public.physio_patients (
  physio_id uuid references public.profiles(id) on delete cascade not null,
  patient_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (physio_id, patient_id)
);

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

alter table public.profiles enable row level security;
alter table public.health_profiles enable row level security;
alter table public.user_personality enable row level security;
alter table public.training_plans enable row level security;
alter table public.sessions enable row level security;
alter table public.user_memories enable row level security;

create policy "Users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users manage own health profile" on public.health_profiles for all using (auth.uid() = user_id);
create policy "Users manage own personality" on public.user_personality for all using (auth.uid() = user_id);
create policy "Users read own plans" on public.training_plans for select using (auth.uid() = assigned_to);
create policy "Users insert own plans" on public.training_plans for insert with check (auth.uid() = assigned_to);
create policy "Users manage own sessions" on public.sessions for all using (auth.uid() = user_id);
create policy "Users manage own memories" on public.user_memories for all using (auth.uid() = user_id);
