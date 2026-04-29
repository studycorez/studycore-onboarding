create table if not exists weekly_reports (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references students(id) on delete cascade,
  week_start  date not null,
  week_end    date not null,
  report_data jsonb not null,
  ai_summary  text,
  sent_at     timestamptz,
  created_at  timestamptz default now()
);

create index if not exists idx_weekly_reports_student on weekly_reports(student_id, week_start desc);

alter table weekly_reports enable row level security;
drop policy if exists "auth_all_weekly_reports" on weekly_reports;
create policy "auth_all_weekly_reports" on weekly_reports for all using (auth.role() = 'authenticated');
