-- ================================================================
-- EcoEngineers — Migration 004: Economia por Reaproveitamento
-- Adiciona valor de mercado e custo de reaproveitamento por material,
-- e os campos financeiros calculados em cada registro de resíduo:
--   prejuizo_descarte     -> perda quando o material é descartado
--   custo_reaproveitamento -> custo de reprocessar o material
--   valor_economizado      -> economia líquida (valor de mercado - custo)
-- Idempotente: seguro rodar mais de uma vez.
-- ================================================================

SET NAMES utf8mb4;

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS valor_unitario_kg        DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Valor de mercado/substituição por kg',
  ADD COLUMN IF NOT EXISTS custo_reaproveitamento_kg DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Custo para reprocessar/reaproveitar por kg';

ALTER TABLE registros_residuos
  ADD COLUMN IF NOT EXISTS prejuizo_descarte      DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Perda financeira quando destino = descarte',
  ADD COLUMN IF NOT EXISTS custo_reaproveitamento DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Custo de reprocessar o material',
  ADD COLUMN IF NOT EXISTS valor_economizado      DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Economia líquida obtida ao reaproveitar';

SELECT 'Migration 004 aplicada com sucesso.' AS status;
