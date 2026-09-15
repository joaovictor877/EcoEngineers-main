'use strict';

const express = require('express');
const router  = express.Router();
const QRCode  = require('qrcode');

module.exports = function (dbQuery, dbClient, io, authMiddleware) {

  // ── Produtos ────────────────────────────────────────────────

  router.get('/produtos', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery('SELECT * FROM produtos ORDER BY nome');
      return res.json(r.rows);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao buscar produtos' });
    }
  });

  router.post('/produtos', authMiddleware, async (req, res) => {
    try {
      const { sku, nome, categoria, peso_esperado_kg, tolerancia_kg } = req.body;
      if (!sku || !nome || !peso_esperado_kg) {
        return res.status(400).json({ error: 'sku, nome e peso_esperado_kg são obrigatórios' });
      }
      const tolerancia = tolerancia_kg !== undefined ? tolerancia_kg : 0.05;

      if (dbClient === 'mysql') {
        const ins = await dbQuery(
          'INSERT INTO produtos (sku, nome, categoria, peso_esperado_kg, tolerancia_kg) VALUES ($1,$2,$3,$4,$5)',
          [sku, nome, categoria || null, peso_esperado_kg, tolerancia]
        );
        const row = await dbQuery('SELECT * FROM produtos WHERE id = $1', [ins.raw.insertId]);
        return res.json(row.rows[0]);
      }
      const r = await dbQuery(
        'INSERT INTO produtos (sku, nome, categoria, peso_esperado_kg, tolerancia_kg) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [sku, nome, categoria || null, peso_esperado_kg, tolerancia]
      );
      return res.json(r.rows[0]);
    } catch (err) {
      console.error('[Produtos] Erro ao criar:', err.message);
      return res.status(500).json({ error: 'Falha ao criar produto (verifique se o SKU já existe)' });
    }
  });

  router.put('/produtos/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    try {
      const { sku, nome, categoria, peso_esperado_kg, tolerancia_kg, ativo } = req.body;
      await dbQuery(
        'UPDATE produtos SET sku=$1, nome=$2, categoria=$3, peso_esperado_kg=$4, tolerancia_kg=$5, ativo=$6 WHERE id=$7',
        [sku, nome, categoria || null, peso_esperado_kg, tolerancia_kg, ativo === false ? 0 : 1, id]
      );
      const r = await dbQuery('SELECT * FROM produtos WHERE id=$1', [id]);
      if (!r.rows[0]) return res.status(404).json({ error: 'Produto não encontrado' });
      return res.json(r.rows[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao atualizar produto' });
    }
  });

  router.delete('/produtos/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    try {
      await dbQuery('DELETE FROM produtos WHERE id=$1', [id]);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao remover produto' });
    }
  });

  // ── Etiquetas (QR Code) ─────────────────────────────────────

  router.get('/etiquetas', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery(
        `SELECT e.*, p.nome AS produto_nome, p.sku AS produto_sku,
                p.peso_esperado_kg AS produto_peso_esperado_kg, p.tolerancia_kg AS produto_tolerancia_kg
         FROM etiquetas e LEFT JOIN produtos p ON e.produto_id = p.id
         ORDER BY e.criado_em DESC`
      );
      return res.json(r.rows);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao buscar etiquetas' });
    }
  });

  // POST /api/etiquetas — { produto_id, pedido_referencia }
  // Gera automaticamente um código de QR único vinculado ao produto.
  router.post('/etiquetas', authMiddleware, async (req, res) => {
    try {
      const { produto_id, pedido_referencia } = req.body;
      if (!produto_id) return res.status(400).json({ error: 'produto_id é obrigatório' });

      const prod = await dbQuery('SELECT sku FROM produtos WHERE id = $1', [produto_id]);
      if (!prod.rows[0]) return res.status(400).json({ error: 'Produto não encontrado' });

      const codigoQr = `ECO-QR-${prod.rows[0].sku}-${Date.now().toString(36).toUpperCase()}`;

      let etiqueta;
      if (dbClient === 'mysql') {
        const ins = await dbQuery(
          'INSERT INTO etiquetas (produto_id, codigo_qr, pedido_referencia) VALUES ($1,$2,$3)',
          [produto_id, codigoQr, pedido_referencia || null]
        );
        const row = await dbQuery('SELECT * FROM etiquetas WHERE id = $1', [ins.raw.insertId]);
        etiqueta = row.rows[0];
      } else {
        const r = await dbQuery(
          'INSERT INTO etiquetas (produto_id, codigo_qr, pedido_referencia) VALUES ($1,$2,$3) RETURNING *',
          [produto_id, codigoQr, pedido_referencia || null]
        );
        etiqueta = r.rows[0];
      }

      const qrImageDataUrl = await QRCode.toDataURL(codigoQr, { margin: 1, width: 300 });
      return res.json({ ...etiqueta, qr_image: qrImageDataUrl });
    } catch (err) {
      console.error('[Etiquetas] Erro ao criar:', err.message);
      return res.status(500).json({ error: 'Falha ao gerar etiqueta' });
    }
  });

  // GET /api/etiquetas/:id/qrcode — reimprime o QR de uma etiqueta existente
  router.get('/etiquetas/:id/qrcode', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    try {
      const r = await dbQuery('SELECT codigo_qr FROM etiquetas WHERE id = $1', [id]);
      if (!r.rows[0]) return res.status(404).json({ error: 'Etiqueta não encontrada' });
      const qrImageDataUrl = await QRCode.toDataURL(r.rows[0].codigo_qr, { margin: 1, width: 300 });
      return res.json({ qr_image: qrImageDataUrl, codigo_qr: r.rows[0].codigo_qr });
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao gerar imagem do QR' });
    }
  });

  router.delete('/etiquetas/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    try {
      await dbQuery('DELETE FROM etiquetas WHERE id=$1', [id]);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao remover etiqueta' });
    }
  });

  return router;
};
