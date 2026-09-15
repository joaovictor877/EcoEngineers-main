-- ================================================================
-- EcoEngineers — Migration 005: Câmeras RTSP (Intelbras Mibo iM1)
-- Adiciona o protocolo da câmera (http/rtsp). Para RTSP, a URL completa
-- com credenciais (ex: rtsp://admin:CHAVE@IP:554/cam/realmonitor?...)
-- fica armazenada em url_stream, assim como já acontece para HTTP.
-- Idempotente: seguro rodar mais de uma vez.
-- ================================================================

SET NAMES utf8mb4;

ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS protocolo ENUM('http','rtsp') NOT NULL DEFAULT 'http' COMMENT 'Tipo de conexão da câmera';

SELECT 'Migration 005 aplicada com sucesso.' AS status;
