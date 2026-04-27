-- Google Calendar OAuth tokens for tutors
ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS google_access_token  text,
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_calendar_connected boolean NOT NULL DEFAULT false;

-- Google Calendar event IDs for sessions (for update/delete)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS google_event_id text;
