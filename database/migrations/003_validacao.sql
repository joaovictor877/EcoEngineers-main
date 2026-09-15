-- ================================================================
-- EcoEngineers — Migration 003: Posto de Validação de Expedição
-- Novo fluxo: item -> câmera + balança + QR Code -> aprovado/reprovado
-- Não altera as tabelas legadas (materials, wastes, registros_residuos).
-- Idempotente: seguro rodar mais de uma vez.
-- Run with: mysql -u engenharia_85 -p engenharia_85 < 003_validacao.sql
-- ================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── produtos: catálogo do que é esperado sair na expedição ───────
CREATE TABLE IF NOT EXISTS produtos (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku                 VARCHAR(60)  NOT NULL,
  nome                VARCHAR(150) NOT NULL,
  categoria           VARCHAR(120) NULL,
  peso_esperado_kg    DECIMAL(10,3) NOT NULL,
  tolerancia_kg       DECIMAL(10,3) NOT NULL DEFAULT 0.050,
  imagem_referencia_url VARCHAR(255) NULL,
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  criado_em           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_produtos_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── etiquetas: um QR Code por pedido/item a ser expedido ──────────
CREATE TABLE IF NOT EXISTS etiquetas (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  produto_id          INT UNSIGNED NOT NULL,
  codigo_qr           VARCHAR(120) NOT NULL,
  pedido_referencia   VARCHAR(120) NULL,
  criado_em           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_etiquetas_codigo_qr (codigo_qr),
  CONSTRAINT fk_etiquetas_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── postos_validacao: um posto físico (câmera + balança) ──────────
CREATE TABLE IF NOT EXISTS postos_validacao (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(100) NOT NULL,
  camera_id     INT NULL,
  dispositivo_id INT NULL,
  localizacao   VARCHAR(150) NULL,
  status        ENUM('ativo','inativo','erro') NOT NULL DEFAULT 'ativo',
  criado_em     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_posto_camera FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL,
  CONSTRAINT fk_posto_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── validacoes: o registro central (aprovado/reprovado) ───────────
CREATE TABLE IF NOT EXISTS validacoes (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  posto_id            INT UNSIGNED NULL,
  etiqueta_id         INT UNSIGNED NULL,
  produto_esperado_id INT UNSIGNED NULL,
  analise_ia_id       INT NULL,
  usuario_id          INT NULL,
  peso_medido         DECIMAL(10,3) NULL,
  qrcode_lido         VARCHAR(120) NULL,
  imagem_url          VARCHAR(255) NULL,
  resultado           ENUM('aprovado','reprovado') NOT NULL,
  motivo_divergencia  TEXT NULL,
  criado_em           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validacoes_resultado (resultado),
  KEY idx_validacoes_criado (criado_em),
  CONSTRAINT fk_val_posto    FOREIGN KEY (posto_id)            REFERENCES postos_validacao(id) ON DELETE SET NULL,
  CONSTRAINT fk_val_etiqueta FOREIGN KEY (etiqueta_id)         REFERENCES etiquetas(id)        ON DELETE SET NULL,
  CONSTRAINT fk_val_produto  FOREIGN KEY (produto_esperado_id) REFERENCES produtos(id)         ON DELETE SET NULL,
  CONSTRAINT fk_val_ia       FOREIGN KEY (analise_ia_id)       REFERENCES analises_ia(id)      ON DELETE SET NULL,
  CONSTRAINT fk_val_usuario  FOREIGN KEY (usuario_id)          REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Posto de validação padrão ──────────────────────────────────
INSERT INTO postos_validacao (nome, localizacao, status)
SELECT 'Posto de Embalagem 01', 'Expedição', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM postos_validacao WHERE nome = 'Posto de Embalagem 01');

-- ── Produtos de exemplo para demonstração ─────────────────────────
INSERT INTO produtos (sku, nome, categoria, peso_esperado_kg, tolerancia_kg)
SELECT 'SKU-1001', 'Kit de Engrenagens A', 'Componentes Mecânicos', 2.500, 0.050
WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE sku = 'SKU-1001');

INSERT INTO produtos (sku, nome, categoria, peso_esperado_kg, tolerancia_kg)
SELECT 'SKU-1002', 'Conjunto de Parafusos B', 'Fixadores', 0.800, 0.030
WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE sku = 'SKU-1002');

INSERT INTO produtos (sku, nome, categoria, peso_esperado_kg, tolerancia_kg)
SELECT 'SKU-1003', 'Placa Estampada C', 'Estamparia', 4.200, 0.080
WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE sku = 'SKU-1003');

-- ── Etiquetas/QR de exemplo, vinculadas aos produtos acima ────────
INSERT INTO etiquetas (produto_id, codigo_qr, pedido_referencia)
SELECT p.id, 'ECO-QR-SKU-1001-0001', 'PED-0001'
FROM produtos p WHERE p.sku = 'SKU-1001'
  AND NOT EXISTS (SELECT 1 FROM etiquetas WHERE codigo_qr = 'ECO-QR-SKU-1001-0001');

INSERT INTO etiquetas (produto_id, codigo_qr, pedido_referencia)
SELECT p.id, 'ECO-QR-SKU-1002-0001', 'PED-0002'
FROM produtos p WHERE p.sku = 'SKU-1002'
  AND NOT EXISTS (SELECT 1 FROM etiquetas WHERE codigo_qr = 'ECO-QR-SKU-1002-0001');

INSERT INTO etiquetas (produto_id, codigo_qr, pedido_referencia)
SELECT p.id, 'ECO-QR-SKU-1003-0001', 'PED-0003'
FROM produtos p WHERE p.sku = 'SKU-1003'
  AND NOT EXISTS (SELECT 1 FROM etiquetas WHERE codigo_qr = 'ECO-QR-SKU-1003-0001');

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Migration 003 aplicada com sucesso.' AS status;
