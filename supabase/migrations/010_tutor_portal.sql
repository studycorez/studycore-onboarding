-- Tutor auth
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS setup_token text;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS setup_token_expires_at timestamptz;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Resources library
CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type text NOT NULL,
  url text,
  file_url text,
  category text NOT NULL DEFAULT 'general',
  uploaded_by text DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);
