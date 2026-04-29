-- Homework completion tracking
alter table sessions
  add column if not exists homework_completed boolean default false,
  add column if not exists homework_completed_at timestamptz;

-- Per-student resource library
create table if not exists student_resources (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references students(id) on delete cascade,
  tutor_id    uuid references tutors(id) on delete set null,
  session_id  uuid references sessions(id) on delete set null,
  title       text not null,
  url         text,
  subject     text,       -- Reading, Math, Writing, Science, General
  resource_type text,     -- khan_academy, college_board, custom, video, pdf
  notes       text,
  created_at  timestamptz default now()
);

create index if not exists idx_student_resources_student on student_resources(student_id, created_at desc);
alter table student_resources enable row level security;
create policy "auth_all_student_resources" on student_resources for all using (auth.role() = 'authenticated');
