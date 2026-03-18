-- ============================================================
-- Migración: Tabla telegram_logs para Bot de Telegram 440 Clinic
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS telegram_logs (
  id              BIGSERIAL PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  chat_id         TEXT NOT NULL,
  message         TEXT NOT NULL,
  intent          JSONB,
  action          TEXT CHECK (action IN ('crear', 'editar', 'eliminar', 'consultar', 'desconocido', 'error')),
  calendar_result JSONB,
  response_sent   TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_telegram_logs_user    ON telegram_logs (telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_logs_chat    ON telegram_logs (chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_logs_action  ON telegram_logs (action);
CREATE INDEX IF NOT EXISTS idx_telegram_logs_created ON telegram_logs (created_at DESC);

-- RLS: Habilitar pero solo permitir INSERT desde el servidor (service role)
ALTER TABLE telegram_logs ENABLE ROW LEVEL SECURITY;

-- Permitir INSERT anónimo (desde el webhook de Vercel con anon key)
CREATE POLICY "Permitir INSERT desde webhook"
  ON telegram_logs FOR INSERT
  TO anon
  WITH CHECK (true);

-- Solo el service role puede SELECT (para el panel admin futuro)
CREATE POLICY "Solo service role puede leer logs"
  ON telegram_logs FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- Vista útil para el panel Admin (muestra los últimos 50 logs)
-- ============================================================
CREATE OR REPLACE VIEW v_telegram_logs_recientes AS
SELECT
  id,
  telegram_username,
  action,
  message,
  (intent::json->>'paciente')   AS paciente,
  (intent::json->>'fecha')      AS fecha,
  (intent::json->>'hora_inicio') AS hora,
  response_sent,
  error IS NOT NULL             AS tuvo_error,
  created_at
FROM telegram_logs
ORDER BY created_at DESC
LIMIT 50;
