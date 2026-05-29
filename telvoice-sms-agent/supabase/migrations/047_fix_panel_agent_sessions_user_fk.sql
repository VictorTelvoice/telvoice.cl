-- Corrige FK incorrecta: user_id del panel cliente apunta a user_profiles, no solo admin_users.

ALTER TABLE public.panel_agent_sessions
  DROP CONSTRAINT IF EXISTS panel_agent_sessions_user_id_fkey;

COMMENT ON COLUMN public.panel_agent_sessions.user_id IS
  'UUID opcional (user_profiles.id o admin_users.id). Sin FK para no bloquear el chat del panel.';

CREATE INDEX IF NOT EXISTS idx_panel_agent_sessions_user
  ON public.panel_agent_sessions (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_panel_agent_sessions_channel
  ON public.panel_agent_sessions (channel, created_at DESC);
