-- FK audit helper functions.
-- These wrap information_schema queries so they can be called via supabase.rpc()
-- from scripts/audit-fk-references.ts without requiring a direct Postgres connection.
-- Apply in Supabase SQL Editor before running the audit script.

-- Returns every column with a formal FOREIGN KEY constraint pointing to
-- the given referenced table+column.
CREATE OR REPLACE FUNCTION public.get_formal_fk_refs(
  p_referenced_table  TEXT DEFAULT 'sessions',
  p_referenced_column TEXT DEFAULT 'id'
)
RETURNS TABLE(
  table_schema      TEXT,
  table_name        TEXT,
  column_name       TEXT,
  referenced_schema TEXT,
  referenced_table  TEXT,
  referenced_column TEXT,
  constraint_name   TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    tc.table_schema::TEXT,
    kcu.table_name::TEXT,
    kcu.column_name::TEXT,
    ccu.table_schema::TEXT  AS referenced_schema,
    ccu.table_name::TEXT    AS referenced_table,
    ccu.column_name::TEXT   AS referenced_column,
    tc.constraint_name::TEXT
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON  tc.constraint_name = kcu.constraint_name
    AND tc.table_schema    = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON  ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema    = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name      = p_referenced_table
    AND ccu.column_name     = p_referenced_column
  ORDER BY kcu.table_name, kcu.column_name;
$$;

-- Returns every column whose NAME suggests a session reference
-- (pattern-based, not constrained-FK-based). Used to surface missing FKs.
CREATE OR REPLACE FUNCTION public.get_suspected_session_cols()
RETURNS TABLE(
  table_schema TEXT,
  table_name   TEXT,
  column_name  TEXT,
  data_type    TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    table_schema::TEXT,
    table_name::TEXT,
    column_name::TEXT,
    data_type::TEXT
  FROM information_schema.columns
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND (
      column_name LIKE '%session_id%'
      OR column_name LIKE '%_session'
      OR column_name = 'session_uuid'
    )
  ORDER BY table_name, column_name;
$$;

-- Lock down: only service_role should be able to call these.
-- (They use SECURITY DEFINER so they bypass RLS on information_schema.)
REVOKE EXECUTE ON FUNCTION public.get_formal_fk_refs(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_formal_fk_refs(TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_formal_fk_refs(TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_suspected_session_cols() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_suspected_session_cols() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_suspected_session_cols() TO service_role;
