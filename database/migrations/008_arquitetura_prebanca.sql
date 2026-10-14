-- ================================================================
-- EcoEngineers — Migration 008: itens da arquitetura da pré-banca
-- 1) postos_validacao.linha/codigo — identifica linha e posto, usados
--    no tópico MQTT <linha>/<posto>/validacao (ex: linha-01/posto-03).
-- 2) validacoes: retenção da caixa (status_entrega = 'retido'), origem do
--    peso (balança ou manual), origem da validação (web ou MQTT),
--    resultado da verificação por imagem e estado da calibração.
-- 3) calibracoes_balanca — histórico de calibração contra peso conhecido.
-- 4) push_subscriptions — inscrições de Web Push (alerta no celular do
--    gestor mesmo com o app fechado).
-- Idempotente: seguro rodar mais de uma vez.
-- ================================================================

SET NAMES utf8mb4;

ALTER TABLE postos_validacao
  ADD COLUMN IF NOT EXISTS linha  VARCHAR(40) NOT NULL DEFAULT 'linha-01' COMMENT 'Identificador da linha (tópico MQTT)',
  ADD COLUMN IF NOT EXISTS codigo VARCHAR(40) NULL COMMENT 'Identificador do posto na linha (tópico MQTT)';

UPDATE postos_validacao SET codigo = CONCAT('posto-', LPAD(id, 2, '0')) WHERE codigo IS NULL;

ALTER TABLE validacoes
  ADD COLUMN IF NOT EXISTS origem           ENUM('web','mqtt') NOT NULL DEFAULT 'web' COMMENT 'Canal que disparou a validação',
  ADD COLUMN IF NOT EXISTS origem_peso       ENUM('balanca','manual') NOT NULL DEFAULT 'balanca' COMMENT 'De onde veio o peso medido',
  ADD COLUMN IF NOT EXISTS imagem_confere    TINYINT(1) NULL COMMENT '1 = imagem confere com o produto, 0 = diverge, NULL = não verificada',
  ADD COLUMN IF NOT EXISTS imagem_confianca  DECIMAL(5,2) NULL,
  ADD COLUMN IF NOT EXISTS balanca_calibrada TINYINT(1) NULL COMMENT 'Calibração da balança válida no momento da validação';

ALTER TABLE validacoes
  MODIFY COLUMN status_entrega ENUM('expedido','entregue','retido') NOT NULL DEFAULT 'expedido';

-- Reprovações antigas ainda abertas passam a ficar retidas (não seguem para despacho).
UPDATE validacoes SET status_entrega = 'retido' WHERE resultado = 'reprovado' AND resolvido = 0 AND status_entrega = 'expedido';

CREATE TABLE IF NOT EXISTS calibracoes_balanca (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  posto_id         INT UNSIGNED NULL,
  peso_referencia  DECIMAL(10,3) NOT NULL COMMENT 'Massa padrão conhecida colocada na balança (kg)',
  peso_lido        DECIMAL(10,3) NOT NULL COMMENT 'Leitura da balança com a massa padrão (kg)',
  erro_percentual  DECIMAL(7,3) NOT NULL,
  aprovada         TINYINT(1) NOT NULL,
  usuario_id       INT NULL,
  criado_em        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_calib_posto (posto_id, criado_em),
  CONSTRAINT fk_calib_posto   FOREIGN KEY (posto_id)   REFERENCES postos_validacao(id) ON DELETE SET NULL,
  CONSTRAINT fk_calib_usuario FOREIGN KEY (usuario_id) REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT NULL,
  endpoint    VARCHAR(500) NOT NULL,
  p256dh      VARCHAR(255) NOT NULL,
  auth        VARCHAR(255) NOT NULL,
  criado_em   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint(255)),
  CONSTRAINT fk_push_usuario FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chaves VAPID do Web Push geradas uma vez e reaproveitadas entre deploys.
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
  chave      VARCHAR(100) NOT NULL,
  valor      TEXT NOT NULL,
  PRIMARY KEY (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 008 aplicada com sucesso.' AS status;
