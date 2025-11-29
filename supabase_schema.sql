-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Subscriptions Table (for Payment Callback)
create table if not exists public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  plan_type text not null, -- 'monthly', 'yearly'
  status text not null, -- 'active', 'expired'
  start_date timestamp with time zone,
  end_date timestamp with time zone,
  payment_id text,
  amount numeric,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

-- Enable RLS for subscriptions
alter table public.subscriptions enable row level security;

-- Policy: Users can read their own subscription
create policy "Users can view own subscription" 
on public.subscriptions for select 
using (auth.uid() = user_id);

-- Policy: Service role (backend) can do everything
-- (Service role bypasses RLS by default, but good to be explicit if needed)


-- 2. Annotations Table (for Data Sync)
create table if not exists public.annotations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  file_path text not null,
  data text, -- JSON string of annotations
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, file_path)
);

-- Enable RLS for annotations
alter table public.annotations enable row level security;

-- Policy: Users can do everything with their own annotations
create policy "Users can manage own annotations" 
on public.annotations for all 
using (auth.uid() = user_id);


-- 3. Translations Table (for Data Sync)
create table if not exists public.translations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  file_path text not null,
  original_text text not null,
  translated_text text,
  context text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for translations
alter table public.translations enable row level security;

-- Policy: Users can do everything with their own translations
create policy "Users can manage own translations" 
on public.translations for all 
using (auth.uid() = user_id);


-- 4. Vocabulary Table (Existing, but ensuring it's there)
create table if not exists public.vocabulary (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  word text not null,
  translation text,
  context text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_reviewed timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, word)
);

-- Enable RLS for vocabulary
alter table public.vocabulary enable row level security;

-- Policy: Users can manage own vocabulary
create policy "Users can manage own vocabulary" 
on public.vocabulary for all 
using (auth.uid() = user_id);


-- 5. Vocabulary Progress Table (for Spaced Repetition)
create table if not exists public.vocabulary_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  word text not null,
  translation text,
  context text,
  proficiency_level integer default 0, -- 0-5, 0=new, 5=mastered
  review_count integer default 0,
  last_reviewed timestamp with time zone,
  next_review timestamp with time zone,
  ease_factor float default 2.5, -- for SM-2 algorithm
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, word)
);

-- Enable RLS for vocabulary_progress
alter table public.vocabulary_progress enable row level security;

-- Policy: Users can manage own vocabulary progress
create policy "Users can manage own vocabulary progress" 
on public.vocabulary_progress for all 
using (auth.uid() = user_id);


-- 6. Study Sessions Table (for Heatmap)
create table if not exists public.study_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  study_date date not null,
  words_studied integer default 0,
  words_reviewed integer default 0,
  accuracy_rate float default 0,
  study_duration integer default 0, -- in seconds
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, study_date)
);

-- Enable RLS for study_sessions
alter table public.study_sessions enable row level security;

-- Policy: Users can manage own study sessions
create policy "Users can manage own study sessions" 
on public.study_sessions for all 
using (auth.uid() = user_id);
