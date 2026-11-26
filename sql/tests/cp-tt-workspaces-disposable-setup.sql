-- Shared workspace catalog prerequisite for isolated TimeTracker PostgreSQL tests.
-- PostgreSQL 17 disposable database only; never run against production.
\set ON_ERROR_STOP on
CREATE TABLE IF NOT EXISTS public.workspaces(id uuid PRIMARY KEY);
INSERT INTO public.workspaces(id) VALUES
 ('00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001')
ON CONFLICT(id) DO NOTHING;
