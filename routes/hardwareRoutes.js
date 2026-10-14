'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (dbQuery, dbClient, io, authMiddleware) {
  const hardwareApiKey = process.env.HARDWARE_API_KEY;

  function hwKeyMiddleware(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!hardwareApiKey || key !== hardwareApiKey) {
      return res.status(401).json({ error: 'x-api-key inválida ou ausente' });
    }
    next();
  }

  // ─────────────────────────────────────────────────────────
  // POST /api/hardware/peso  — chamado pelo ESP32 via Wi-Fi
  // Header: x-api-key: <HARDWARE_API_KEY>
  // Body:   { "peso": 12.45, "dispositivo": "ESP32 Principal" }
  // ─────────────────────────────────────────────────────────
  router.post('/peso', hwKeyMiddleware, async (req, res) => {
    const { peso, dispositivo } = req.body;
    if (peso === undefined || peso === null) {
      return res.status(400).json({ error: 'Campo "peso" é obrigatório' });
    }
    const pesoNum = parseFloat(peso);
    if (isNaN(pesoNum) || pesoNum < 0) {
      return res.status(400).json({ error: 'Valor de "peso" inválido' });
    }

    try {
      let dispositivoId = null;
      try {
        const nomeDev = dispositivo || 'ESP32 Principal';
        const dev = await dbQuery('SELECT id FROM dispositivos WHERE nome = $1 LIMIT 1', [nomeDev]);
        if (dev.rows[0]) {
          dispositivoId = dev.rows[0].id;
          await dbQuery('UPDATE dispositivos SET status = $1, ultima_atualizacao = NOW() WHERE id = $2', ['conectado', dispositivoId]);
        }
      } catch (_) { /* tabela pode ainda não existir */ }

      try {
        await dbQuery('INSERT INTO leituras_hardware (dispositivo_id, peso) VALUES ($1, $2)', [dispositivoId, pesoNum]);
      } catch (_) { /* silencioso */ }

      io.emit('peso_atualizado', {
        peso:       pesoNum,
        dispositivo: dispositivo || 'ESP32 Principal',
        timestamp:  new Date().toISOString(),
      });

      return res.json({ ok: true, peso: pesoNum });
    } catch (err) {
      console.error('[Hardware] Erro ao processar peso:', err.message);
      return res.status(500).json({ error: 'Falha ao processar leitura de peso' });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/hardware/calibracao — chamado por scripts/calibrar-balanca.ps1
  // depois de calibrar o Arduino com um peso conhecido. Fica no mesmo
  // histórico da calibração feita pela tela do Posto de Validação.
  // Header: x-api-key: <HARDWARE_API_KEY>
  // Body:   { "peso_referencia": 1.0, "peso_lido": 0.998, "posto_id": 1 }
  // ─────────────────────────────────────────────────────────
  router.post('/calibracao', hwKeyMiddleware, async (req, res) => {
    const referencia = parseFloat(req.body.peso_referencia);
    const lido = parseFloat(req.body.peso_lido);
    if (!isFinite(referencia) || referencia <= 0 || !isFinite(lido) || lido < 0) {
      return res.status(400).json({ error: 'peso_referencia (> 0) e peso_lido são obrigatórios' });
    }
    const erroMax = Number(process.env.CALIBRACAO_ERRO_MAX_PERCENT || 1);
    const erro = Math.abs(lido - referencia) / referencia * 100;
    const aprovada = erro <= erroMax;
    const postoId = req.body.posto_id ? parseInt(req.body.posto_id, 10) : null;
    try {
      const ins = await dbQuery(
        'INSERT INTO calibracoes_balanca (posto_id, peso_referencia, peso_lido, erro_percentual, aprovada, usuario_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [postoId, referencia, lido, erro.toFixed(3), aprovada ? 1 : 0, null]
      );
      const r = await dbQuery('SELECT * FROM calibracoes_balanca WHERE id = $1', [ins.raw.insertId]);
      io.emit('calibracao_registrada', r.rows[0]);
      return res.json({ ...r.rows[0], erro_maximo_percentual: erroMax });
    } catch (err) {
      console.error('[Hardware] Erro ao registrar calibração:', err.message);
      return res.status(500).json({ error: 'Falha ao registrar calibração' });
    }
  });

  // GET /api/hardware/status
  router.get('/status', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery('SELECT * FROM dispositivos ORDER BY tipo');
      return res.json(r.rows);
    } catch (_) {
      return res.json([]);
    }
  });

  // GET /api/hardware/leituras
  router.get('/leituras', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery(
        'SELECT lh.*, d.nome as dispositivo_nome FROM leituras_hardware lh LEFT JOIN dispositivos d ON lh.dispositivo_id = d.id ORDER BY lh.recebido_em DESC LIMIT 50'
      );
      return res.json(r.rows);
    } catch (_) {
      return res.json([]);
    }
  });

  // PUT /api/hardware/dispositivos/:id/status
  router.put('/dispositivos/:id/status', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

    const allowed = ['conectado', 'desconectado', 'erro', 'pronto'];
    const { status } = req.body;
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido' });

    try {
      await dbQuery('UPDATE dispositivos SET status = $1, ultima_atualizacao = NOW() WHERE id = $2', [status, id]);
      const dev = await dbQuery('SELECT * FROM dispositivos WHERE id = $1', [id]);
      io.emit('dispositivo_atualizado', dev.rows[0]);
      return res.json(dev.rows[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao atualizar dispositivo' });
    }
  });

  return router;
};
