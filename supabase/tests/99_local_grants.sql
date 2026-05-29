-- =============================================================================
-- LOCAL VALIDATION GRANTS (test harness only)
-- =============================================================================
-- Supabase auto-grants table/function privileges to anon/authenticated. On a
-- plain Postgres we must do it ourselves, AFTER all tables/functions exist, so
-- the `authenticated` role can exercise the RLS policies in the isolation test.
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
