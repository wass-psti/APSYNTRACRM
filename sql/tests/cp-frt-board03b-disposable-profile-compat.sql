-- Disposable FRT CI fixture only: production profiles already has display_name.
-- This must never be executed in production.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
