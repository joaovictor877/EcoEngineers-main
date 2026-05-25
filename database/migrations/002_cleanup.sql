-- ================================================================
-- EcoEngineers — Migration 002: Limpeza do banco e usuários
-- Remove tabelas duplicadas / não usadas
-- Adiciona colunas de perfil na tabela users
-- ATENÇÃO: execute APÓS rodar scripts/seed-users.js
-- ================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── 1. Remover tabelas duplicadas/não utilizadas ─────────────────
DROP TABLE IF EXISTS waste_tracking;   -- duplicata de registros_residuos
DROP TABLE IF EXISTS materiais;        -- duplicata de materials

-- ── 2. Recriar FKs com tipos compatíveis (schema legado -> atual) ─
-- users.id/materials.id podem estar como BIGINT UNSIGNED no ambiente online.
-- Alinhamos colunas-filhas antes de criar as FKs.
ALTER TABLE registros_residuos MODIFY COLUMN material_id BIGINT UNSIGNED NULL;
ALTER TABLE registros_residuos MODIFY COLUMN usuario_id  BIGINT UNSIGNED NULL;
ALTER TABLE wastes            MODIFY COLUMN material_id BIGINT UNSIGNED NULL;
ALTER TABLE wastes            MODIFY COLUMN user_id     BIGINT UNSIGNED NULL;

-- Remove FKs antigas se existirem (nomes podem variar por ambiente)
SET @fk_rr_mat := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'registros_residuos'
    AND COLUMN_NAME = 'material_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @sql_rr_mat_drop := IF(
  @fk_rr_mat IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE registros_residuos DROP FOREIGN KEY ', @fk_rr_mat)
);
PREPARE stmt_rr_mat_drop FROM @sql_rr_mat_drop;
EXECUTE stmt_rr_mat_drop;
DEALLOCATE PREPARE stmt_rr_mat_drop;

SET @fk_rr_usr := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'registros_residuos'
    AND COLUMN_NAME = 'usuario_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @sql_rr_usr_drop := IF(
  @fk_rr_usr IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE registros_residuos DROP FOREIGN KEY ', @fk_rr_usr)
);
PREPARE stmt_rr_usr_drop FROM @sql_rr_usr_drop;
EXECUTE stmt_rr_usr_drop;
DEALLOCATE PREPARE stmt_rr_usr_drop;

SET @fk_w_user := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wastes'
    AND COLUMN_NAME = 'user_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @sql_w_user_drop := IF(
  @fk_w_user IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE wastes DROP FOREIGN KEY ', @fk_w_user)
);
PREPARE stmt_w_user_drop FROM @sql_w_user_drop;
EXECUTE stmt_w_user_drop;
DEALLOCATE PREPARE stmt_w_user_drop;

SET @fk_w_mat := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wastes'
    AND COLUMN_NAME = 'material_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @sql_w_mat_drop := IF(
  @fk_w_mat IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE wastes DROP FOREIGN KEY ', @fk_w_mat)
);
PREPARE stmt_w_mat_drop FROM @sql_w_mat_drop;
EXECUTE stmt_w_mat_drop;
DEALLOCATE PREPARE stmt_w_mat_drop;

-- Recria FKs corretas
ALTER TABLE registros_residuos
  ADD CONSTRAINT fk_rr_mat FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;
ALTER TABLE registros_residuos
  ADD CONSTRAINT fk_rr_usr FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE wastes
  ADD CONSTRAINT fk_wastes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE wastes
  ADD CONSTRAINT fk_wastes_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;

-- Agora é seguro remover usuarios
DROP TABLE IF EXISTS usuarios;

-- ── 3. Atualizar estrutura da tabela users ───────────────────────
-- Adiciona cargo e setor se ainda não existirem
-- (execute via scripts/seed-users.js que faz isso automaticamente)
-- Ou execute manualmente se as colunas ainda não existirem:
-- ALTER TABLE users ADD COLUMN cargo VARCHAR(100) NULL;
-- ALTER TABLE users ADD COLUMN setor VARCHAR(100) NULL;

-- Renomear role padrão de 'operator' para usar os novos perfis
UPDATE users SET role = 'operador' WHERE role = 'operator';

-- ── 4. Garantir charset utf8mb4 nas tabelas principais ───────────
ALTER TABLE users              CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE materials          CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE registros_residuos CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE analises_ia        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE cameras            CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE dispositivos       CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE leituras_hardware  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE wastes             CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── 5. Adicionar câmera padrão se não existir ────────────────────
INSERT INTO cameras (nome, url_stream, status)
SELECT 'Câmera IP Principal', 'https://camera.joaovictor.app.br', 'ativa'
WHERE NOT EXISTS (SELECT 1 FROM cameras WHERE url_stream = 'https://camera.joaovictor.app.br');

SET FOREIGN_KEY_CHECKS = 1;

-- ── Tabelas que devem existir após esta migração ─────────────────
-- users, materials, wastes, registros_residuos,
-- cameras, analises_ia, dispositivos, leituras_hardware

SELECT 'Migration 002 aplicada com sucesso.' AS status;
