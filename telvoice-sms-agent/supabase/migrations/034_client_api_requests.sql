-- =============================================================================
-- Logs de requests API pública (Fase 2.5)
-- Migración ADITIVA. NO activa RLS. NO almacena secrets ni Authorization.
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NULL REFERENCES companies (id) ON DELETE SET NULL,
  api_key_id UUID NULL REFERENCES client_api_keys (id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  environment TEXT NULL,
  status_code INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  error_code TEXT NULL,
  error_message TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  duration_ms INTEGER NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_api_requests_request_id_unique UNIQUE (request_id),
  CONSTRAINT client_api_requests_method_check CHECK (
    method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
  ),
  CONSTRAINT client_api_requests_environment_check CHECK (
    environment IS NULL OR environment IN ('sandbox', 'production')
  )
);

CREATE INDEX IF NOT EXISTS idx_client_api_requests_company_id
  ON client_api_requests (company_id);

CREATE INDEX IF NOT EXISTS idx_client_api_requests_api_key_id
  ON client_api_requests (api_key_id);

CREATE INDEX IF NOT EXISTS idx_client_api_requests_request_id
  ON client_api_requests (request_id);

CREATE INDEX IF NOT EXISTS idx_client_api_requests_status_code
  ON client_api_requests (status_code);

CREATE INDEX IF NOT EXISTS idx_client_api_requests_error_code
  ON client_api_requests (error_code);

CREATE INDEX IF NOT EXISTS idx_client_api_requests_created
  ON client_api_requests (created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS (opcional — NO habilitado por defecto)
-- ALTER TABLE client_api_requests ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
