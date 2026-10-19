-- Airtable linking columns — applied 2026-10-18
ALTER TABLE students ADD COLUMN IF NOT EXISTS airtable_seq integer;
ALTER TABLE students ADD COLUMN IF NOT EXISTS airtable_record_id text;

CREATE UNIQUE INDEX IF NOT EXISTS students_airtable_seq_unique
  ON students(airtable_seq) WHERE airtable_seq IS NOT NULL;

ALTER TABLE tutors ADD COLUMN IF NOT EXISTS airtable_tutor_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS tutors_airtable_tutor_id_unique
  ON tutors(airtable_tutor_id) WHERE airtable_tutor_id IS NOT NULL;
