'use strict';

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { analisarMaterial, capturarFrameCamera } = require('../services/aiService');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = `ia_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname || '.jpg'));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

async function salvarAnalise(dbQuery, dbClient, payload) {
  const { camera_id, material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino } = payload;
  try {
    if (dbClient === 'mysql') {
      try {
        const ins = await dbQuery(
          'INSERT INTO analises_ia (camera_id, material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [camera_id || null, material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino || null]
        );
        return ins.raw.insertId;
      } catch (e) {
        if (String(e.message || '').toLowerCase().includes('sugestao_destino')) {
          const legacy = await dbQuery(
            'INSERT INTO analises_ia (camera_id, material_detectado, categoria_detectada, confianca, observacao, imagem_url) VALUES ($1,$2,$3,$4,$5,$6)',
            [camera_id || null, material_detectado, categoria_detectada, confianca, observacao, imagem_url]
          );
          return legacy.raw.insertId;
        }
        throw e;
      }
    }
    try {
      const ins = await dbQuery(
        'INSERT INTO analises_ia (camera_id, material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [camera_id || null, material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino || null]
      );
      return ins.rows[0].id;
    } catch (e) {
      if (String(e.message || '').toLowerCase().includes('sugestao_destino')) {
        const legacy = await dbQuery(
          'INSERT INTO analises_ia (camera_id, material_detectado, categoria_detectada, confianca, observacao, imagem_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [camera_id || null, material_detectado, categoria_detectada, confianca, observacao, imagem_url]
        );
        return legacy.rows[0].id;
      }
      throw e;
    }
  } catch (e) {
    console.error('[IA] Falha ao salvar análise:', e.message);
    return null;
  }
}

module.exports = function (dbQuery, dbClient, io, authMiddleware) {

  // ─────────────────────────────────────────────────────────
  // POST /api/ia/analisar — upload de imagem + análise
  // Form-data: imagem (file, opcional), camera_id (string)
  // ─────────────────────────────────────────────────────────
  router.post('/analisar', authMiddleware, upload.single('imagem'), async (req, res) => {
    try {
      const { camera_id } = req.body;
      const resultado = await analisarMaterial(req.file);
      const imagemUrl = req.file ? `/uploads/${req.file.filename}` : null;

      const analiseId = await salvarAnalise(dbQuery, dbClient, { ...resultado, camera_id, imagem_url: imagemUrl });
      const payload = { ...resultado, analise_id: analiseId, imagem_url: imagemUrl };

      io.emit('analise_ia_concluida', payload);
      return res.json(payload);
    } catch (err) {
      console.error('[IA] Erro /analisar:', err.message);
      return res.status(500).json({ error: 'Falha na análise de IA' });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/ia/capturar-camera — captura frame e analisa
  // Body: { camera_url, camera_id }
  // ─────────────────────────────────────────────────────────
  router.post('/capturar-camera', authMiddleware, async (req, res) => {
    const { camera_url, camera_id } = req.body;
    if (!camera_url) return res.status(400).json({ error: 'camera_url é obrigatória' });

    try {
      const file     = await capturarFrameCamera(camera_url);
      const resultado = await analisarMaterial(file);
      const imagemUrl = `/uploads/${file.filename}`;

      const analiseId = await salvarAnalise(dbQuery, dbClient, { ...resultado, camera_id, imagem_url: imagemUrl });
      const payload = { ...resultado, analise_id: analiseId, imagem_url: imagemUrl };

      io.emit('analise_ia_concluida', payload);
      return res.json(payload);
    } catch (err) {
      console.error('[IA] Erro /capturar-camera:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/ia/historico
  router.get('/historico', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery('SELECT * FROM analises_ia ORDER BY analisado_em DESC LIMIT 50');
      return res.json(r.rows);
    } catch (_) {
      return res.json([]);
    }
  });

  // GET /api/ia/stats
  router.get('/stats', authMiddleware, async (req, res) => {
    try {
      const total       = await dbQuery('SELECT COUNT(*) as total FROM analises_ia');
      const avgConf     = await dbQuery('SELECT AVG(confianca) as media FROM analises_ia');
      const ultimo      = await dbQuery('SELECT material_detectado, analisado_em FROM analises_ia ORDER BY analisado_em DESC LIMIT 1');
      const porMaterial = await dbQuery('SELECT material_detectado, COUNT(*) as quantidade FROM analises_ia GROUP BY material_detectado ORDER BY quantidade DESC LIMIT 10');

      return res.json({
        total_deteccoes:  Number(total.rows[0]?.total || 0),
        confianca_media:  parseFloat(Number(avgConf.rows[0]?.media || 0).toFixed(1)),
        ultimo_material:  ultimo.rows[0]?.material_detectado || null,
        ultimo_em:        ultimo.rows[0]?.analisado_em || null,
        por_material:     porMaterial.rows,
      });
    } catch (_) {
      return res.json({ total_deteccoes: 0, confianca_media: 0, ultimo_material: null, por_material: [] });
    }
  });

  return router;
};
