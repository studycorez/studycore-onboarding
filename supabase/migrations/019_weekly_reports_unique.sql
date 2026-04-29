-- Add unique constraint so weekly_reports can be upserted by student + week
alter table weekly_reports
  add constraint if not exists weekly_reports_student_week_unique
  unique (student_id, week_start);
