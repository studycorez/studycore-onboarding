-- Students can share a family email address, so the unique constraint is too strict.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_email_key;
