-- Conteos agrupados de SMS entrantes no leídos (reduce egress vs. escanear filas en Node).

CREATE INDEX IF NOT EXISTS idx_inbound_sms_company_unread
  ON inbound_sms_messages (company_id, client_number_id)
  WHERE status = 'received';

CREATE OR REPLACE FUNCTION public.count_inbound_sms_unread_by_number(
  p_company_id UUID,
  p_client_number_id UUID DEFAULT NULL
)
RETURNS TABLE (
  client_number_id UUID,
  unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.client_number_id,
    COUNT(*)::BIGINT AS unread_count
  FROM inbound_sms_messages m
  WHERE m.company_id = p_company_id
    AND m.status = 'received'
    AND (
      p_client_number_id IS NULL
      OR m.client_number_id = p_client_number_id
    )
  GROUP BY m.client_number_id;
$$;

COMMENT ON FUNCTION public.count_inbound_sms_unread_by_number IS
  'Agrupa SMS entrantes no leídos por numeración. Unread = status received (leído pasa a read; sin read_at/seen_at).';

GRANT EXECUTE ON FUNCTION public.count_inbound_sms_unread_by_number(UUID, UUID)
  TO service_role;
