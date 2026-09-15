-- ================================================================
-- EcoEngineers — Migration 006: Modo de conexão da câmera (pull/push)
-- pull = servidor acessa a câmera direto (mesma rede)
-- push = a câmera/ponte local envia os frames pro servidor (Azure/nuvem,
--        quando o servidor NÃO está na mesma rede da câmera)
-- Idempotente: seguro rodar mais de uma vez.
-- ================================================================

SET NAMES utf8mb4;

ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS modo_conexao ENUM('pull','push') NOT NULL DEFAULT 'pull' COMMENT 'pull = servidor acessa a câmera; push = câmera/ponte envia frames pro servidor';

SELECT 'Migration 006 aplicada com sucesso.' AS status;
