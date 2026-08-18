-- SURF Demo feedback storage
-- Run this once in the target Supabase project SQL editor.

create table if not exists public.demo_research_feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quick', 'survey')),
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'xjtlu-demo',
  app_version text,
  created_at timestamptz not null default now()
);

create index if not exists demo_research_feedback_kind_created_idx
  on public.demo_research_feedback (kind, created_at desc);

alter table public.demo_research_feedback enable row level security;

-- No public RLS policy is intentionally created.
-- The Next.js server route uses SUPABASE_SERVICE_ROLE_KEY server-side only.
-- Never expose the service-role key through NEXT_PUBLIC_* variables.
