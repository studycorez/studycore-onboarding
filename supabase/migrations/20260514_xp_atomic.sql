-- Add idempotency_key column to xp_events
ALTER TABLE xp_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT NULL;

-- Partial unique index: enforce uniqueness only when key is present.
-- Legacy rows without a key are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_idempotency_key_unique
  ON xp_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Level computation helper (mirrors getLevelInfo in src/lib/xp.ts).
-- Keep in sync if level thresholds change in TS.
CREATE OR REPLACE FUNCTION compute_xp_level(xp INTEGER)
RETURNS INTEGER AS $$
BEGIN
  IF xp >= 12000 THEN RETURN 7;
  ELSIF xp >= 7000 THEN RETURN 6;
  ELSIF xp >= 4000 THEN RETURN 5;
  ELSIF xp >= 2000 THEN RETURN 4;
  ELSIF xp >= 900 THEN RETURN 3;
  ELSIF xp >= 300 THEN RETURN 2;
  ELSE RETURN 1;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Atomic XP award.
-- Returns: { awarded boolean, new_xp int, new_level int }
-- awarded = false means idempotency key already used, no-op.
CREATE OR REPLACE FUNCTION award_xp_atomic(
  p_student_id UUID,
  p_xp_amount INTEGER,
  p_event_type TEXT,
  p_description TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE(awarded BOOLEAN, new_xp INTEGER, new_level INTEGER) AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_xp INTEGER;
  v_new_level INTEGER;
BEGIN
  -- Lock the student row to serialize concurrent awards
  PERFORM 1 FROM students WHERE id = p_student_id FOR UPDATE;

  -- Check if this idempotency key was already used
  IF p_idempotency_key IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM xp_events WHERE idempotency_key = p_idempotency_key
    ) INTO v_exists;

    IF v_exists THEN
      SELECT xp_points, xp_level INTO v_new_xp, v_new_level
      FROM students WHERE id = p_student_id;
      RETURN QUERY SELECT FALSE, COALESCE(v_new_xp, 0), COALESCE(v_new_level, 1);
      RETURN;
    END IF;
  END IF;

  -- Insert event
  INSERT INTO xp_events (student_id, event_type, xp_earned, description, idempotency_key)
  VALUES (p_student_id, p_event_type, p_xp_amount, p_description, p_idempotency_key);

  -- Update student XP and level
  UPDATE students
  SET xp_points = COALESCE(xp_points, 0) + p_xp_amount,
      xp_level = compute_xp_level(COALESCE(xp_points, 0) + p_xp_amount)
  WHERE id = p_student_id
  RETURNING xp_points, xp_level INTO v_new_xp, v_new_level;

  RETURN QUERY SELECT TRUE, v_new_xp, v_new_level;
END;
$$ LANGUAGE plpgsql;

-- Atomic badge award.
-- Idempotent: returns awarded=false if badge already on student.
-- Uses SELECT ... FOR UPDATE for concurrent-safe check.
CREATE OR REPLACE FUNCTION award_badge_atomic(
  p_student_id UUID,
  p_badge_key TEXT,
  p_xp_amount INTEGER,
  p_badge_label TEXT
)
RETURNS TABLE(awarded BOOLEAN, new_xp INTEGER, new_level INTEGER, new_badges TEXT[]) AS $$
DECLARE
  v_current_badges TEXT[];
  v_new_xp INTEGER;
  v_new_level INTEGER;
  v_new_badges TEXT[];
  v_idempotency_key TEXT;
  v_event_exists BOOLEAN;
BEGIN
  -- Lock the student row and check current badges
  SELECT badges INTO v_current_badges
  FROM students
  WHERE id = p_student_id
  FOR UPDATE;

  IF v_current_badges IS NULL THEN
    v_current_badges := ARRAY[]::TEXT[];
  END IF;

  -- Already has this badge — no-op
  IF p_badge_key = ANY(v_current_badges) THEN
    SELECT xp_points, xp_level INTO v_new_xp, v_new_level
    FROM students WHERE id = p_student_id;
    RETURN QUERY SELECT FALSE, COALESCE(v_new_xp, 0), COALESCE(v_new_level, 1), v_current_badges;
    RETURN;
  END IF;

  -- Belt-and-suspenders: check the idempotency key isn't already used
  -- (badges array is the primary check; this catches edge cases where
  -- badges array was manually edited)
  v_idempotency_key := 'badge_' || p_badge_key || ':' || p_student_id::TEXT;

  SELECT EXISTS(
    SELECT 1 FROM xp_events WHERE idempotency_key = v_idempotency_key
  ) INTO v_event_exists;

  IF v_event_exists THEN
    -- Event exists but badge wasn't on student — repair the badges array
    v_new_badges := array_append(v_current_badges, p_badge_key);
    UPDATE students
    SET badges = v_new_badges
    WHERE id = p_student_id
    RETURNING xp_points, xp_level INTO v_new_xp, v_new_level;
    RETURN QUERY SELECT FALSE, v_new_xp, v_new_level, v_new_badges;
    RETURN;
  END IF;

  -- Insert event
  INSERT INTO xp_events (student_id, event_type, xp_earned, description, idempotency_key)
  VALUES (p_student_id, 'badge_' || p_badge_key, p_xp_amount,
          'Earned badge: ' || p_badge_label, v_idempotency_key);

  -- Append badge, add XP, recompute level
  v_new_badges := array_append(v_current_badges, p_badge_key);

  UPDATE students
  SET badges = v_new_badges,
      xp_points = COALESCE(xp_points, 0) + p_xp_amount,
      xp_level = compute_xp_level(COALESCE(xp_points, 0) + p_xp_amount)
  WHERE id = p_student_id
  RETURNING xp_points, xp_level INTO v_new_xp, v_new_level;

  RETURN QUERY SELECT TRUE, v_new_xp, v_new_level, v_new_badges;
END;
$$ LANGUAGE plpgsql;
