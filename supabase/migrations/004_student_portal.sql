-- Student Portal: auth, XP system, gamification
ALTER TABLE students ADD COLUMN IF NOT EXISTS portal_password_hash text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS portal_setup_token text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS portal_setup_token_expires_at timestamptz;
ALTER TABLE students ADD COLUMN IF NOT EXISTS portal_last_login_at timestamptz;
ALTER TABLE students ADD COLUMN IF NOT EXISTS xp_points integer DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS xp_level integer DEFAULT 1;
ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_animal text DEFAULT 'fox';
ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_color text DEFAULT 'Purple';
ALTER TABLE students ADD COLUMN IF NOT EXISTS battle_cry text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS streak_weeks integer DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_session_week text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS badges text[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  xp_earned integer NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
