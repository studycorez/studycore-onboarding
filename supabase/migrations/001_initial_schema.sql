-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────
-- ENUMS  (DO blocks make them idempotent)
-- ────────────────────────────────────────────────
do $$ begin
  create type availability_mode as enum ('form', 'manual');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type session_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_status as enum ('pending', 'paid', 'waived');
exception when duplicate_object then null;
end $$;

-- ────────────────────────────────────────────────
-- TUTORS
-- ────────────────────────────────────────────────
create table if not exists tutors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  phone         text,
  photo_url     text,
  bio           text,
  subjects      text[] not null default '{}',
  hourly_rate   numeric(10,2) not null default 0,
  payment_info  text,
  zoom_user_id  text,
  availability_mode availability_mode not null default 'manual',
  created_at    timestamptz not null default now()
);

-- ────────────────────────────────────────────────
-- TUTOR AVAILABILITY (recurring weekly slots)
-- ────────────────────────────────────────────────
create table if not exists tutor_availability (
  id           uuid primary key default gen_random_uuid(),
  tutor_id     uuid not null references tutors(id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  is_active    boolean not null default true,
  constraint valid_time_range check (end_time > start_time)
);

create index if not exists idx_tutor_availability_tutor on tutor_availability(tutor_id);

-- ────────────────────────────────────────────────
-- STUDENTS
-- ────────────────────────────────────────────────
create table if not exists students (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text not null,
  phone          text,
  parent_name    text,
  parent_email   text,
  grade          smallint check (grade between 9 and 12),
  target_score   smallint check (target_score between 400 and 1600),
  current_score  smallint check (current_score between 400 and 1600),
  notes          text,
  created_at     timestamptz not null default now()
);

-- ────────────────────────────────────────────────
-- SESSIONS
-- ────────────────────────────────────────────────
create table if not exists sessions (
  id                uuid primary key default gen_random_uuid(),
  tutor_id          uuid not null references tutors(id) on delete restrict,
  student_id        uuid not null references students(id) on delete restrict,
  scheduled_at      timestamptz not null,
  duration_minutes  integer not null default 60 check (duration_minutes > 0),
  zoom_meeting_id   text,
  zoom_join_url     text,
  zoom_host_url     text,
  status            session_status not null default 'scheduled',
  session_notes     text,
  tutor_feedback    text,
  payment_status    payment_status not null default 'pending',
  payment_amount    numeric(10,2),
  reminder_24h_sent boolean not null default false,
  reminder_1h_sent  boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists idx_sessions_tutor      on sessions(tutor_id);
create index if not exists idx_sessions_student    on sessions(student_id);
create index if not exists idx_sessions_scheduled  on sessions(scheduled_at);
create index if not exists idx_sessions_status     on sessions(status);

-- ────────────────────────────────────────────────
-- STUDENT PROGRESS
-- ────────────────────────────────────────────────
create table if not exists student_progress (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students(id) on delete cascade,
  session_id     uuid references sessions(id) on delete set null,
  math_score     smallint check (math_score between 200 and 800),
  reading_score  smallint check (reading_score between 200 and 800),
  writing_score  smallint check (writing_score between 200 and 800),
  total_score    smallint check (total_score between 400 and 1600),
  notes          text,
  recorded_at    timestamptz not null default now()
);

create index if not exists idx_progress_student on student_progress(student_id);

-- ────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- (alter ... enable rls is idempotent)
-- ────────────────────────────────────────────────
alter table tutors             enable row level security;
alter table tutor_availability enable row level security;
alter table students           enable row level security;
alter table sessions           enable row level security;
alter table student_progress   enable row level security;

-- Policies: drop first so re-runs are safe
drop policy if exists "auth_all_tutors"            on tutors;
drop policy if exists "auth_all_availability"      on tutor_availability;
drop policy if exists "auth_all_students"          on students;
drop policy if exists "auth_all_sessions"          on sessions;
drop policy if exists "auth_all_progress"          on student_progress;
drop policy if exists "public_read_availability"   on tutor_availability;
drop policy if exists "public_update_availability" on tutor_availability;
drop policy if exists "public_read_tutors"         on tutors;
drop policy if exists "public_write_students"      on students;
drop policy if exists "public_write_sessions"      on sessions;

-- Allow all operations for authenticated users
create policy "auth_all_tutors"            on tutors            for all using (auth.role() = 'authenticated');
create policy "auth_all_availability"      on tutor_availability for all using (auth.role() = 'authenticated');
create policy "auth_all_students"          on students          for all using (auth.role() = 'authenticated');
create policy "auth_all_sessions"          on sessions          for all using (auth.role() = 'authenticated');
create policy "auth_all_progress"          on student_progress  for all using (auth.role() = 'authenticated');

-- Public access for the tutor availability form (no login required)
create policy "public_read_availability"   on tutor_availability for select using (true);
create policy "public_update_availability" on tutor_availability for all    using (true);
create policy "public_read_tutors"         on tutors             for select using (true);
create policy "public_write_students"      on students           for all    using (true);
create policy "public_write_sessions"      on sessions           for all    using (true);
