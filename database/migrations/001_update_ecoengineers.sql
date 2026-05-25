-- ================================================================
-- EcoEngineers — Migration 001
-- Idempotent: safe to run multiple times
-- Run with: mysql -u engenharia_85 -p engenharia_85 < 001_update_ecoengineers.sql
-- ================================================================

SET NAMES utf8mb4;
SET CHARACTER_SET_CLIENT = utf8mb4;
SET CHARACTER_SET_CONNECTION = utf8mb4;
SET CHARACTER_SET_RESULTS = utf8mb4;

-- ── cameras: add url columns if missing ──────────────────────────
ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS url_base  VARCHAR(255) NULL COMMENT 'Root URL, e.g. https://camera.app.br',
  ADD COLUMN IF NOT EXISTS url_video VARCHAR(255) NULL COMMENT 'Stream path, e.g. .../video',
  ADD COLUMN IF NOT EXISTS url_foto  VARCHAR(255) NULL COMMENT 'Snapshot path, e.g. .../photo.jpg';

-- Insert default camera if not present
INSERT INTO cameras (nome, url_base, url_video, url_foto, status)
SELECT
  'Câmera IP Principal',
  'https://camera.joaovictor.app.br',
  'https://camera.joaovictor.app.br/video',
  'https://camera.joaovictor.app.br/photo.jpg',
  'ativa'
WHERE NOT EXISTS (
  SELECT 1 FROM cameras WHERE url_base = 'https://camera.joaovictor.app.br'
);

-- ── analises_ia: ensure extended columns exist ───────────────────
ALTER TABLE analises_ia
  ADD COLUMN IF NOT EXISTS sugestao_destino    VARCHAR(80)  NULL,
  ADD COLUMN IF NOT EXISTS categoria_detectada VARCHAR(120) NULL;

-- ── report_exports: audit table for export events ────────────────
CREATE TABLE IF NOT EXISTS report_exports (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  tipo        ENUM('csv','excel','pdf') NOT NULL,
  filtros     JSON NULL COMMENT 'startDate, endDate, material',
  total_linhas INT NOT NULL DEFAULT 0,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_usuario (usuario_id),
  KEY idx_criado  (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Fix charset on core tables ───────────────────────────────────
ALTER TABLE registros_residuos
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE materials
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE users
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE cameras
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Done ─────────────────────────────────────────────────────────
SELECT 'Migration 001 applied successfully.' AS status;
