-- Add timezone column to students for smart scheduling
alter table students
  add column if not exists timezone text default 'America/New_York';
