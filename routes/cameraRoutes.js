'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (dbQuery, dbClient, io, authMiddleware) {

  // GET /api/cameras
  router.get('/', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery('SELECT * FROM cameras ORDER BY criado_em DESC');
      return res.json(r.rows);
    } catch (_) {
      return res.json([]);
    }
  });

  // POST /api/cameras — { nome, url_stream }
  router.post('/', authMiddleware, async (req, res) => {
    const { nome, url_stream } = req.body;
    if (!nome || !url_stream) return res.status(400).json({ error: 'nome e url_stream são obrigatórios' });

    try {
      if (dbClient === 'mysql') {
        const ins = await dbQuery('INSERT INTO cameras (nome, url_stream) VALUES ($1,$2)', [nome, url_stream]);
        const r   = await dbQuery('SELECT * FROM cameras WHERE id = $1', [ins.raw.insertId]);
        return res.json(r.rows[0]);
      }
      const r = await dbQuery('INSERT INTO cameras (nome, url_stream) VALUES ($1,$2) RETURNING *', [nome, url_stream]);
      return res.json(r.rows[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao salvar câmera' });
    }
  });

  // PUT /api/cameras/:id — { nome, url_stream, status }
  router.put('/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

    const { nome, url_stream, status } = req.body;
    const allowedStatus = ['ativa', 'inativa', 'erro'];
    const st = allowedStatus.includes(status) ? status : 'ativa';

    try {
      await dbQuery('UPDATE cameras SET nome = $1, url_stream = $2, status = $3 WHERE id = $4', [nome, url_stream, st, id]);
      const r = await dbQuery('SELECT * FROM cameras WHERE id = $1', [id]);
      return res.json(r.rows[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao atualizar câmera' });
    }
  });

  // DELETE /api/cameras/:id
  router.delete('/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    try {
      await dbQuery('DELETE FROM cameras WHERE id = $1', [id]);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao remover câmera' });
    }
  });

  return router;
};
