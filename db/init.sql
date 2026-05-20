-- Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'operator',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Materials
CREATE TABLE IF NOT EXISTS materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(100),
  unit VARCHAR(20) DEFAULT 'kg',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_materials_name (name)
) ENGINE=InnoDB;

-- Wastes
CREATE TABLE IF NOT EXISTS wastes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  material_id INT,
  quantity DECIMAL(12,3) NOT NULL,
  location VARCHAR(255),
  recovered TINYINT(1) DEFAULT 0,
  value DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wastes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_wastes_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Waste tracking
CREATE TABLE IF NOT EXISTS waste_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  waste_id INT,
  status VARCHAR(100) NOT NULL,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_waste_tracking_waste FOREIGN KEY (waste_id) REFERENCES wastes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- NOVAS TABELAS — EcoEngineers v2 (IA + Hardware + Câmera)
-- ============================================================

CREATE TABLE IF NOT EXISTS dispositivos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  tipo ENUM('esp32','arduino_uno','sensor_peso','camera_ip','leitor_codigo_barras') NOT NULL,
  ip VARCHAR(50),
  porta VARCHAR(50),
  status ENUM('conectado','desconectado','erro','pronto') DEFAULT 'desconectado',
  ultima_atualizacao TIMESTAMP NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leituras_hardware (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dispositivo_id INT,
  peso DECIMAL(10,2),
  recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lh_disp FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cameras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(100),
  url_stream VARCHAR(255),
  status ENUM('ativa','inativa','erro') DEFAULT 'ativa',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS analises_ia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  camera_id INT,
  material_detectado VARCHAR(120),
  categoria_detectada VARCHAR(120),
  confianca DECIMAL(5,2),
  observacao TEXT,
  imagem_url VARCHAR(255),
  resultado_json JSON,
  sugestao_destino VARCHAR(80),
  analisado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_cam FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registros_residuos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  material_id INT,
  usuario_id INT,
  analise_ia_id INT NULL,
  peso DECIMAL(10,2),
  setor_origem VARCHAR(100),
  destino VARCHAR(100),
  status ENUM('producao','separacao','armazenamento','reaproveitamento','descarte') DEFAULT 'producao',
  codigo_barras VARCHAR(100),
  observacao TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rr_mat FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
  CONSTRAINT fk_rr_usr FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_rr_ia  FOREIGN KEY (analise_ia_id) REFERENCES analises_ia(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Dispositivos padrão
INSERT INTO dispositivos (nome, tipo, status) SELECT 'ESP32 Principal','esp32','desconectado' WHERE NOT EXISTS (SELECT 1 FROM dispositivos WHERE nome='ESP32 Principal');
INSERT INTO dispositivos (nome, tipo, status) SELECT 'Arduino Uno','arduino_uno','desconectado' WHERE NOT EXISTS (SELECT 1 FROM dispositivos WHERE nome='Arduino Uno');
INSERT INTO dispositivos (nome, tipo, status) SELECT 'Sensor HX711','sensor_peso','desconectado' WHERE NOT EXISTS (SELECT 1 FROM dispositivos WHERE nome='Sensor HX711');

-- Câmera padrão
INSERT INTO cameras (nome, url_stream) SELECT 'Câmera IP 01','http://192.168.1.120:8080' WHERE NOT EXISTS (SELECT 1 FROM cameras WHERE nome='Câmera IP 01');

-- Seed sample materials
INSERT INTO materials (name, category, unit)
SELECT 'Aço', 'Metal', 'kg'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE name = 'Aço');

INSERT INTO materials (name, category, unit)
SELECT 'Ferro', 'Metal', 'kg'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE name = 'Ferro');

INSERT INTO materials (name, category, unit)
SELECT 'Alumínio', 'Metal', 'kg'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE name = 'Alumínio');

INSERT INTO materials (name, category, unit)
SELECT 'Cobre', 'Metal', 'kg'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE name = 'Cobre');
