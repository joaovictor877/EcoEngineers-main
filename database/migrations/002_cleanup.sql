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

-- ── 2. Corrigir FK de registros_residuos para apontar a users ────
-- (em alguns ambientes o FK foi criado apontando para usuarios)
ALTER TABLE registros_residuos DROP FOREIGN KEY fk_rr_usr;
ALTER TABLE registros_residuos
  ADD CONSTRAINT fk_rr_usr FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL;

-- Agora é seguro remover usuarios
DROP TABLE IF EXISTS usuarios;

-- ── 2. Atualizar estrutura da tabela users ───────────────────────
-- Adiciona cargo e setor se ainda não existirem
-- (execute via scripts/seed-users.js que faz isso automaticamente)
-- Ou execute manualmente se as colunas ainda não existirem:
-- ALTER TABLE users ADD COLUMN cargo VARCHAR(100) NULL;
-- ALTER TABLE users ADD COLUMN setor VARCHAR(100) NULL;

-- Renomear role padrão de 'operator' para usar os novos perfis
UPDATE users SET role = 'operador' WHERE role = 'operator';

-- ── 3. Garantir charset utf8mb4 nas tabelas principais ───────────
ALTER TABLE users              CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE materials          CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE registros_residuos CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE analises_ia        CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE cameras            CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE dispositivos       CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE leituras_hardware  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE wastes             CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── 4. Adicionar câmera padrão se não existir ────────────────────
INSERT INTO cameras (nome, url_stream, status)
SELECT 'Câmera IP Principal', 'https://camera.joaovictor.app.br', 'ativa'
WHERE NOT EXISTS (SELECT 1 FROM cameras WHERE url_stream = 'https://camera.joaovictor.app.br');

SET FOREIGN_KEY_CHECKS = 1;

-- ── Tabelas que devem existir após esta migração ─────────────────
-- users, materials, wastes, registros_residuos,
-- cameras, analises_ia, dispositivos, leituras_hardware

SELECT 'Migration 002 aplicada com sucesso.' AS status;
