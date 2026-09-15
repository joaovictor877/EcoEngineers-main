-- ================================================================
-- EcoEngineers — Migration 007: Registro manual + alertas de validação
-- 1) registros_residuos.foto_url — evidência fotográfica manual do resíduo
--    (o registro deixou de depender da classificação automática por IA).
-- 2) validacoes.resolvido* — permite ao gestor/operador marcar uma
--    reprovação de expedição como tratada, para sair da lista de alertas.
-- 3) validacoes.status_entrega* — status interno simples de entrega
--    (expedido -> entregue), sem depender de confirmação externa.
-- Idempotente: seguro rodar mais de uma vez.
-- ================================================================

SET NAMES utf8mb4;

ALTER TABLE registros_residuos
  ADD COLUMN IF NOT EXISTS foto_url VARCHAR(255) NULL COMMENT 'Foto do material anexada manualmente como evidência';

ALTER TABLE validacoes
  ADD COLUMN IF NOT EXISTS resolvido TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Reprovação já foi tratada pelo gestor/operador',
  ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS resolvido_por INT NULL,
  ADD COLUMN IF NOT EXISTS status_entrega ENUM('expedido','entregue') NOT NULL DEFAULT 'expedido',
  ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS entregue_por INT NULL;

-- Adiciona as FKs só se ainda não existirem (idempotente em reexecução manual).
SET @fk_resolvido := (
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'validacoes'
    AND CONSTRAINT_NAME = 'fk_val_resolvido_por'
  LIMIT 1
);
SET @sql_resolvido := IF(
  @fk_resolvido IS NULL,
  'ALTER TABLE validacoes ADD CONSTRAINT fk_val_resolvido_por FOREIGN KEY (resolvido_por) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_resolvido FROM @sql_resolvido;
EXECUTE stmt_resolvido;
DEALLOCATE PREPARE stmt_resolvido;

SET @fk_entregue := (
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'validacoes'
    AND CONSTRAINT_NAME = 'fk_val_entregue_por'
  LIMIT 1
);
SET @sql_entregue := IF(
  @fk_entregue IS NULL,
  'ALTER TABLE validacoes ADD CONSTRAINT fk_val_entregue_por FOREIGN KEY (entregue_por) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_entregue FROM @sql_entregue;
EXECUTE stmt_entregue;
DEALLOCATE PREPARE stmt_entregue;

SELECT 'Migration 007 aplicada com sucesso.' AS status;
