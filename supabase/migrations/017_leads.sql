create type lead_stage as enum ('new', 'contacted', 'qualified', 'demo_scheduled', 'converted', 'lost');

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  phone         text,
  grade         smallint,
  target_score  smallint,
  current_score smallint,
  stage         lead_stage not null default 'new',
  source        text,        -- e.g. 'website', 'referral', 'instagram'
  notes         text,
  assigned_to   text,        -- admin name / email
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_leads_stage on leads(stage);
create index if not exists idx_leads_created on leads(created_at desc);

alter table leads enable row level security;
drop policy if exists "auth_all_leads" on leads;
create policy "auth_all_leads" on leads for all using (auth.role() = 'authenticated');
