-- Config operativa editable desde Superadmin (override sobre .env del proceso)

CREATE TABLE IF NOT EXISTS platform_runtime_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_platform_runtime_settings_updated_at ON platform_runtime_settings;
CREATE TRIGGER trg_platform_runtime_settings_updated_at
  BEFORE UPDATE ON platform_runtime_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE platform_runtime_settings IS 'Overrides operativos (scheduler, pacing). Si existe fila, tiene prioridad sobre variables de entorno al arranque/tick.';
