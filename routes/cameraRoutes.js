'use strict';

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { spawnMjpegBridge } = require('../services/ffmpegService');
const { getUploadsDir } = require('../services/uploadDir');

const uploadsDir = getUploadsDir();
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Frame "ao vivo" — sempre sobrescreve o mesmo arquivo por câmera, então
// o preview no navegador só precisa apontar pra essa URL fixa.
const pushStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `camera_live_${req.params.id}.jpg`),
});
const uploadPush = multer({ storage: pushStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// Monta a URL RTSP completa (com credenciais embutidas) a partir dos campos
// separados que o formulário envia — evita o usuário ter que digitar a URL
// crua e reduz erro de formatação.
function montarUrlRtsp({ rtsp_ip, rtsp_porta, rtsp_usuario, rtsp_chave, rtsp_canal, rtsp_subtipo }) {
  const porta = rtsp_porta || 554;
  const usuario = rtsp_usuario || 'admin';
  const canal = rtsp_canal || 1;
  const subtipo = rtsp_subtipo !== undefined && rtsp_subtipo !== '' ? rtsp_subtipo : 0;
  return `rtsp://${encodeURIComponent(usuario)}:${encodeURIComponent(rtsp_chave || '')}@${rtsp_ip}:${porta}/cam/realmonitor?channel=${canal}&subtype=${subtipo}`;
}

module.exports = function (dbQuery, dbClient, io, authMiddleware) {
  const hardwareApiKey = process.env.HARDWARE_API_KEY;
  function hwKeyMiddleware(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!hardwareApiKey || key !== hardwareApiKey) {
      return res.status(401).json({ error: 'x-api-key inválida ou ausente' });
    }
    next();
  }

  // GET /api/cameras
  router.get('/', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery('SELECT * FROM cameras ORDER BY criado_em DESC');
      return res.json(r.rows);
    } catch (_) {
      return res.json([]);
    }
  });

  // POST /api/cameras
  // HTTP:  { nome, protocolo: 'http', url_stream }
  // RTSP:  { nome, protocolo: 'rtsp', rtsp_ip, rtsp_porta, rtsp_usuario, rtsp_chave, rtsp_canal, rtsp_subtipo }
  router.post('/', authMiddleware, async (req, res) => {
    const { nome, protocolo } = req.body;
    if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
    const modoConexao = req.body.modo_conexao === 'push' ? 'push' : 'pull';

    let urlStream;
    if (protocolo === 'rtsp') {
      if (!req.body.rtsp_ip || !req.body.rtsp_chave) {
        return res.status(400).json({ error: 'IP e chave de acesso são obrigatórios para câmeras RTSP' });
      }
      urlStream = montarUrlRtsp(req.body);
    } else {
      if (!req.body.url_stream) return res.status(400).json({ error: 'url_stream é obrigatória' });
      urlStream = req.body.url_stream;
    }

    try {
      if (dbClient === 'mysql') {
        const ins = await dbQuery(
          'INSERT INTO cameras (nome, url_stream, protocolo, modo_conexao) VALUES ($1,$2,$3,$4)',
          [nome, urlStream, protocolo === 'rtsp' ? 'rtsp' : 'http', modoConexao]
        );
        const r = await dbQuery('SELECT * FROM cameras WHERE id = $1', [ins.raw.insertId]);
        return res.json(r.rows[0]);
      }
      const r = await dbQuery(
        'INSERT INTO cameras (nome, url_stream, protocolo, modo_conexao) VALUES ($1,$2,$3,$4) RETURNING *',
        [nome, urlStream, protocolo === 'rtsp' ? 'rtsp' : 'http', modoConexao]
      );
      return res.json(r.rows[0]);
    } catch (err) {
      console.error('[Cameras] Erro ao criar:', err.message);
      return res.status(500).json({ error: 'Falha ao salvar câmera' });
    }
  });

  // PUT /api/cameras/:id — mesmos campos do POST, + status
  router.put('/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

    const { nome, protocolo, status } = req.body;
    const allowedStatus = ['ativa', 'inativa', 'erro'];
    const st = allowedStatus.includes(status) ? status : 'ativa';
    const modoConexao = req.body.modo_conexao === 'push' ? 'push' : 'pull';

    let urlStream;
    if (protocolo === 'rtsp') {
      if (!req.body.rtsp_ip || !req.body.rtsp_chave) {
        return res.status(400).json({ error: 'IP e chave de acesso são obrigatórios para câmeras RTSP' });
      }
      urlStream = montarUrlRtsp(req.body);
    } else {
      urlStream = req.body.url_stream;
    }

    try {
      await dbQuery(
        'UPDATE cameras SET nome = $1, url_stream = $2, protocolo = $3, status = $4, modo_conexao = $5 WHERE id = $6',
        [nome, urlStream, protocolo === 'rtsp' ? 'rtsp' : 'http', st, modoConexao, id]
      );
      const r = await dbQuery('SELECT * FROM cameras WHERE id = $1', [id]);
      return res.json(r.rows[0]);
    } catch (err) {
      console.error('[Cameras] Erro ao atualizar:', err.message);
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

  // ─────────────────────────────────────────────────────────
  // POST /api/cameras/:id/push-frame — chamado pela ponte local
  // (scripts/bridge-camera-online.ps1), usado quando o servidor NÃO
  // está na mesma rede da câmera (ex: Azure). A ponte roda perto da
  // câmera e envia uma foto a cada poucos segundos.
  // Header: x-api-key: <HARDWARE_API_KEY>
  // Form-data: imagem (file)
  // ─────────────────────────────────────────────────────────
  router.post('/:id/push-frame', hwKeyMiddleware, uploadPush.single('imagem'), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    if (!req.file) return res.status(400).json({ error: 'Campo "imagem" é obrigatório' });

    const imagemUrl = `/uploads/${req.file.filename}`;
    io.emit('camera_frame', { camera_id: id, imagem_url: imagemUrl, t: Date.now() });
    return res.json({ ok: true });
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/cameras/:id/live — preview ao vivo de uma câmera salva.
  // RTSP (ex: Intelbras Mibo): converte para MJPEG via ffmpeg.
  // HTTP: repassa o stream da câmera (mesmo comportamento do proxy-stream).
  // Autenticação por header OU ?token=... (necessário pois <img>/<video>
  // não enviam cabeçalho Authorization).
  // ─────────────────────────────────────────────────────────
  router.get('/:id/live', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

    let camera;
    try {
      const r = await dbQuery('SELECT * FROM cameras WHERE id = $1', [id]);
      camera = r.rows[0];
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao buscar câmera' });
    }
    if (!camera) return res.status(404).json({ error: 'Câmera não encontrada' });

    if (camera.protocolo === 'rtsp') {
      const ffmpeg = spawnMjpegBridge(camera.url_stream);
      let headersSent = false;

      ffmpeg.stdout.once('data', () => {
        if (!headersSent) {
          headersSent = true;
          res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=ffserver');
          res.setHeader('Cache-Control', 'no-store');
        }
      });
      ffmpeg.stdout.pipe(res);

      let stderrTail = '';
      ffmpeg.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-800); });

      const cleanup = () => { try { ffmpeg.kill('SIGKILL'); } catch (_) {} };
      req.on('close', cleanup);
      ffmpeg.on('error', cleanup);
      ffmpeg.on('close', (code) => {
        if (!headersSent && !res.headersSent) {
          res.status(502).json({ error: 'Não foi possível conectar na câmera RTSP: ' + stderrTail });
        } else if (!res.writableEnded) {
          res.end();
        }
      });
      return;
    }

    // HTTP: mesmo comportamento do proxy-stream, mas identificado por id
    const ctrl = new AbortController();
    const connectTimeout = setTimeout(() => ctrl.abort(new Error('timeout de conexão')), 6000);
    req.on('close', () => ctrl.abort());
    try {
      const upstream = await fetch(camera.url_stream, { signal: ctrl.signal });
      clearTimeout(connectTimeout);
      const ct = upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'no-store');
      const { Readable } = require('stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (err) {
      clearTimeout(connectTimeout);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Câmera inacessível a partir do servidor.' });
      }
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/cameras/proxy-stream?url=<encoded camera url>
  // Proxies the camera stream through HTTPS to avoid Mixed
  // Content errors when the frontend is served over HTTPS.
  // The camera must be reachable from the backend server.
  // ─────────────────────────────────────────────────────────
  router.get('/proxy-stream', authMiddleware, async (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'Parâmetro url é obrigatório' });

    let parsed;
    try { parsed = new URL(rawUrl); } catch { return res.status(400).json({ error: 'URL inválida' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Apenas URLs http/https são permitidas' });
    }

    const ctrl = new AbortController();
    // 6 s timeout to establish connection; after that stream until client closes
    const connectTimeout = setTimeout(() => ctrl.abort(new Error('timeout de conexão')), 6000);
    req.on('close', () => ctrl.abort());

    try {
      const upstream = await fetch(rawUrl, { signal: ctrl.signal });
      clearTimeout(connectTimeout);
      const ct = upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'no-store');
      const { Readable } = require('stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (err) {
      clearTimeout(connectTimeout);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Câmera inacessível a partir do servidor. Verifique se a câmera está na mesma rede que o servidor backend.' });
      }
    }
  });

  return router;
};
