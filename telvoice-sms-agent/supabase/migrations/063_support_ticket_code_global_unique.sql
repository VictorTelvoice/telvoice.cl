-- =============================================================================
-- HOTFIX: código de ticket soporte único globalmente (TLV-NNNN)
-- Repara duplicados existentes, índice UNIQUE global, secuencia atómica.
-- NO toca wallet, billing, órdenes, MercadoPago ni numeraciones.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Reparar códigos duplicados (conservar el más antiguo por ticket_code)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  max_n INT;
BEGIN
  SELECT COALESCE(MAX(regexp_replace(ticket_code, '^TLV-', '')::int), 1000)
  INTO max_n
  FROM client_support_tickets
  WHERE ticket_code ~ '^TLV-[0-9]+$';

  FOR r IN
    SELECT
      t.id,
      t.ticket_code,
      t.metadata,
      t.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY t.ticket_code
        ORDER BY t.created_at ASC, t.id ASC
      ) AS rn
    FROM client_support_tickets t
    WHERE t.ticket_code IN (
      SELECT ticket_code
      FROM client_support_tickets
      GROUP BY ticket_code
      HAVING COUNT(*) > 1
    )
  LOOP
    IF r.rn > 1 THEN
      max_n := max_n + 1;
      new_code := 'TLV-' || max_n::text;

      UPDATE client_support_tickets
      SET
        ticket_code = new_code,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'code_repair_reason', 'duplicate_ticket_code_hotfix',
          'previous_code', r.ticket_code,
          'repaired_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'repaired_by', 'system_hotfix'
        ),
        updated_at = now()
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Índice único global (reemplaza UNIQUE por empresa)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_client_support_tickets_company_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_support_tickets_ticket_code_unique
  ON client_support_tickets (ticket_code);

-- ---------------------------------------------------------------------------
-- 3) Secuencia atómica sincronizada con el máximo actual
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS support_ticket_code_seq
  START WITH 1001
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

SELECT setval(
  'support_ticket_code_seq',
  GREATEST(
    COALESCE((
      SELECT MAX(regexp_replace(ticket_code, '^TLV-', '')::int)
      FROM client_support_tickets
      WHERE ticket_code ~ '^TLV-[0-9]+$'
    ), 1000),
    1000
  )
);

-- ---------------------------------------------------------------------------
-- 4) Función RPC para generar el siguiente código
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_support_ticket_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n BIGINT;
BEGIN
  n := nextval('support_ticket_code_seq');
  RETURN 'TLV-' || n::text;
END;
$$;

COMMENT ON FUNCTION public.next_support_ticket_code IS
  'Devuelve el siguiente código global de ticket soporte (TLV-NNNN) vía secuencia atómica.';

GRANT EXECUTE ON FUNCTION public.next_support_ticket_code()
  TO service_role;
