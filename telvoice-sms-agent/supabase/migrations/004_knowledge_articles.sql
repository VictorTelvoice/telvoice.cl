-- Base de conocimiento Telvoice (agente Telegram / soporte)

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category
  ON knowledge_articles (category);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_is_active
  ON knowledge_articles (is_active);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_title
  ON knowledge_articles (title);

DROP TRIGGER IF EXISTS trg_knowledge_articles_updated_at ON knowledge_articles;
CREATE TRIGGER trg_knowledge_articles_updated_at
  BEFORE UPDATE ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Artículos iniciales Telvoice
INSERT INTO knowledge_articles (title, category, keywords, content)
SELECT * FROM (VALUES
  (
    'Qué significa submitted',
    'dlr',
    ARRAY['submitted', 'estado', 'enviado', 'proveedor', 'asmsc']::TEXT[],
    'Submitted significa que aSMSC aceptó el SMS y lo envió al flujo del proveedor. No significa necesariamente delivered.'
  ),
  (
    'Qué significa delivered',
    'dlr',
    ARRAY['delivered', 'entregado', 'dlr', 'confirmación']::TEXT[],
    'Delivered significa que llegó un DLR confirmado por el operador/proveedor.'
  ),
  (
    'Por qué no llega DLR en localhost',
    'dlr',
    ARRAY['dlr', 'localhost', 'webhook', 'local', 'desarrollo']::TEXT[],
    'aSMSC no puede llamar a localhost. Para recibir DLR real se necesita una URL pública como agent.telvoice.cl o un túnel público.'
  ),
  (
    'Qué significa IP Not Whitelisted',
    'errores',
    ARRAY['ip', 'whitelist', 'whitelisted', 'asmsc', 'error']::TEXT[],
    'La IP pública del servidor no está autorizada en aSMSC. Se debe agregar en API → Add Whitelist IP.'
  ),
  (
    'Diferencia entre SMS tipo P y T',
    'sms',
    ARRAY['sms', 'tipo', 'promocional', 'transaccional', 'p', 't']::TEXT[],
    'P es promocional. T es transaccional. Algunas cuentas deben tener T habilitado por proveedor.'
  ),
  (
    'Cómo consultar saldo',
    'saldo',
    ARRAY['saldo', 'balance', 'crédito', 'unidades', 'asmsc']::TEXT[],
    'El saldo interno vive en Telvoice SMS Agent. El balance técnico viene desde aSMSC.'
  ),
  (
    'Cómo enviar SMS por Telegram',
    'telegram',
    ARRAY['telegram', 'enviar', 'bot', 'sms', 'confirmar']::TEXT[],
    'Usar enviar 569XXXXXXXX mensaje. El sistema pedirá confirmación antes de enviar.'
  ),
  (
    'Seguridad de envíos',
    'soporte',
    ARRAY['seguridad', 'autorización', 'confirmación', 'usuarios']::TEXT[],
    'El bot solo permite usuarios autorizados en client_telegram_users y exige confirmación antes de consumir saldo.'
  )
) AS v(title, category, keywords, content)
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles LIMIT 1);
