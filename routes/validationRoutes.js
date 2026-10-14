'use strict';

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { capturarFrameCamera } = require('../services/aiService');
const { getUploadsDir } = require('../services/uploadDir');
const { executarValidacao, buscarValidacao, SELECT_VALIDACAO } = require('../services/validationEngine');

const uploadsDir = getUploadsDir();
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = `val_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
    cb(null, unique + path.extname(file.originalname || '.jpg'));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Erro de calibração aceito (%) para a balança ser considerada calibrada.
const CALIBRACAO_ERRO_MAX = Number(process.env.CALIBRACAO_ERRO_MAX_PERCENT || 1);

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

module.exports = function (dbQuery, dbClient, io, authMiddleware) {

  // ─────────────────────────────────────────────────────────
  // POST /api/validacoes — decide aprovado/reprovado
  // Form-data: imagem (file, opcional se camera_url for enviado)
  // Body:      peso_medido (obrigatório), posto_id, camera_url,
  //            origem_peso ('balanca' | 'manual')
  //
  // Critérios de reprovação (ver services/validationEngine.js):
  //   1) QR Code ausente ou sem etiqueta cadastrada
  //   2) Peso fora da tolerância do produto da etiqueta
  //   3) Imagem não confere com o produto da etiqueta
  // ─────────────────────────────────────────────────────────
  router.post('/', authMiddleware, upload.single('imagem'), async (req, res) => {
    let file = req.file || null;
    try {
      const { posto_id, camera_url } = req.body;
      const pesoMedido = req.body.peso_medido !== undefined ? parseFloat(req.body.peso_medido) : null;

      if (!file && camera_url) {
        file = await capturarFrameCamera(camera_url);
      }
      if (!file) {
        return res.status(400).json({ error: 'Envie uma imagem ou informe camera_url' });
      }
      if (pesoMedido === null || !isFinite(pesoMedido) || pesoMedido < 0) {
        return res.status(400).json({ error: 'peso_medido é obrigatório e deve ser um número válido' });
      }

      const payload = await executarValidacao({ dbQuery, dbClient, io }, {
        file,
        pesoMedido,
        origemPeso: req.body.origem_peso === 'manual' ? 'manual' : 'balanca',
        origem: 'web',
        postoId: posto_id ? parseInt(posto_id, 10) : null,
        usuarioId: req.user.id,
      });
      return res.json(payload);
    } catch (err) {
      console.error('[Validacao] Erro em POST /api/validacoes:', err.message);
      // 530/52x = túnel da câmera (Cloudflare) fora do ar; demais = câmera fora de alcance.
      const cameraFora = /HTTP 5(2\d|30)|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|inacessivel/i.test(err.message);
      if (cameraFora) {
        return res.status(502).json({ error: 'Câmera inacessível: confira se a câmera e o túnel (camera.joaovictor.app.br) estão ligados.' });
      }
      return res.status(500).json({ error: 'Falha ao processar validação: ' + err.message });
    }
  });

  // PUT /api/validacoes/:id/resolver — gestor/operador confirma que tratou
  // uma reprovação (ex: corrigiu a etiqueta). A caixa continua retida até
  // ser revalidada e aprovada no posto.
  router.put('/:id/resolver', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    try {
      await dbQuery(
        'UPDATE validacoes SET resolvido = 1, resolvido_em = NOW(), resolvido_por = $1 WHERE id = $2',
        [req.user.id, id]
      );
      const v = await buscarValidacao(dbQuery, id);
      if (!v) return res.status(404).json({ error: 'Validação não encontrada' });
      io.emit('validacao_resolvida', v);
      return res.json(v);
    } catch (err) {
      console.error('[Validacao] Erro ao resolver:', err.message);
      return res.status(500).json({ error: 'Falha ao marcar validação como resolvida' });
    }
  });

  // PUT /api/validacoes/:id/entregar — marca uma expedição aprovada como
  // entregue. Bloqueia se a mesma caixa tiver retenção posterior em aberto.
  router.put('/:id/entregar', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    try {
      const existing = await dbQuery('SELECT resultado, etiqueta_id FROM validacoes WHERE id = $1', [id]);
      const atual = existing.rows[0];
      if (!atual) return res.status(404).json({ error: 'Validação não encontrada' });
      if (atual.resultado !== 'aprovado') {
        return res.status(400).json({ error: 'Caixa reprovada está retida — só itens aprovados podem ser despachados' });
      }
      if (atual.etiqueta_id) {
        const retida = await dbQuery(
          "SELECT id FROM validacoes WHERE etiqueta_id = $1 AND id > $2 AND resultado = 'reprovado' AND resolvido = 0 LIMIT 1",
          [atual.etiqueta_id, id]
        );
        if (retida.rows[0]) {
          return res.status(409).json({ error: 'Esta caixa foi reprovada numa validação posterior e está retida' });
        }
      }
      await dbQuery(
        "UPDATE validacoes SET status_entrega = 'entregue', entregue_em = NOW(), entregue_por = $1 WHERE id = $2",
        [req.user.id, id]
      );
      const v = await buscarValidacao(dbQuery, id);
      io.emit('validacao_entregue', v);
      return res.json(v);
    } catch (err) {
      console.error('[Validacao] Erro ao marcar entrega:', err.message);
      return res.status(500).json({ error: 'Falha ao marcar validação como entregue' });
    }
  });

  // GET /api/validacoes/caixa/:codigo — situação da caixa para o despacho:
  // "liberada" só se a validação mais recente dela for aprovada.
  router.get('/caixa/:codigo', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery(
        `${SELECT_VALIDACAO} WHERE v.qrcode_lido = $1 ORDER BY v.criado_em DESC, v.id DESC LIMIT 1`,
        [req.params.codigo]
      );
      const ultima = r.rows[0];
      if (!ultima) return res.json({ caixa: req.params.codigo, situacao: 'nao_validada', ultima_validacao: null });
      return res.json({
        caixa: req.params.codigo,
        situacao: ultima.resultado === 'aprovado' ? 'liberada' : 'retida',
        ultima_validacao: ultima,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao consultar caixa' });
    }
  });

  // ── Postos e linhas ─────────────────────────────────────────

  router.get('/postos', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery('SELECT * FROM postos_validacao ORDER BY linha, codigo, nome');
      return res.json(r.rows);
    } catch (_) {
      return res.json([]);
    }
  });

  function lerPosto(body) {
    const nome = String(body.nome || '').trim();
    const linha = String(body.linha || '').trim().toLowerCase();
    const codigo = String(body.codigo || '').trim().toLowerCase();
    if (!nome) return { error: 'nome é obrigatório' };
    if (!SLUG.test(linha) || !SLUG.test(codigo)) {
      return { error: 'linha e codigo devem usar letras minúsculas, números e hífen (ex: linha-01, posto-03)' };
    }
    const camera_id = body.camera_id ? parseInt(body.camera_id, 10) : null;
    const status = ['ativo', 'inativo', 'erro'].includes(body.status) ? body.status : 'ativo';
    return { nome, linha, codigo, camera_id, localizacao: body.localizacao || null, status };
  }

  router.post('/postos', authMiddleware, async (req, res) => {
    const p = lerPosto(req.body);
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const dup = await dbQuery('SELECT id FROM postos_validacao WHERE linha = $1 AND codigo = $2', [p.linha, p.codigo]);
      if (dup.rows[0]) return res.status(409).json({ error: `Já existe ${p.linha}/${p.codigo}` });
      const ins = await dbQuery(
        'INSERT INTO postos_validacao (nome, linha, codigo, camera_id, localizacao, status) VALUES ($1,$2,$3,$4,$5,$6)',
        [p.nome, p.linha, p.codigo, p.camera_id, p.localizacao, p.status]
      );
      const r = await dbQuery('SELECT * FROM postos_validacao WHERE id = $1', [ins.raw.insertId]);
      return res.json(r.rows[0]);
    } catch (err) {
      console.error('[Postos] Erro ao criar:', err.message);
      return res.status(500).json({ error: 'Falha ao criar posto' });
    }
  });

  router.put('/postos/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    const p = lerPosto(req.body);
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const dup = await dbQuery('SELECT id FROM postos_validacao WHERE linha = $1 AND codigo = $2 AND id <> $3', [p.linha, p.codigo, id]);
      if (dup.rows[0]) return res.status(409).json({ error: `Já existe ${p.linha}/${p.codigo}` });
      await dbQuery(
        'UPDATE postos_validacao SET nome=$1, linha=$2, codigo=$3, camera_id=$4, localizacao=$5, status=$6 WHERE id=$7',
        [p.nome, p.linha, p.codigo, p.camera_id, p.localizacao, p.status, id]
      );
      const r = await dbQuery('SELECT * FROM postos_validacao WHERE id = $1', [id]);
      if (!r.rows[0]) return res.status(404).json({ error: 'Posto não encontrado' });
      return res.json(r.rows[0]);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao atualizar posto' });
    }
  });

  router.delete('/postos/:id', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    try {
      await dbQuery('DELETE FROM postos_validacao WHERE id = $1', [id]);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao remover posto' });
    }
  });

  // ── Calibração da balança ───────────────────────────────────
  // POST /api/validacoes/calibracoes
  // Body: { posto_id, peso_referencia, peso_lido }
  // A balança é considerada calibrada se o erro contra a massa padrão
  // ficar dentro de CALIBRACAO_ERRO_MAX_PERCENT (padrão 1%).
  router.post('/calibracoes', authMiddleware, async (req, res) => {
    const referencia = parseFloat(req.body.peso_referencia);
    const lido = parseFloat(req.body.peso_lido);
    if (!isFinite(referencia) || referencia <= 0 || !isFinite(lido) || lido < 0) {
      return res.status(400).json({ error: 'peso_referencia (> 0) e peso_lido são obrigatórios' });
    }
    const erro = Math.abs(lido - referencia) / referencia * 100;
    const aprovada = erro <= CALIBRACAO_ERRO_MAX;
    const postoId = req.body.posto_id ? parseInt(req.body.posto_id, 10) : null;
    try {
      const ins = await dbQuery(
        'INSERT INTO calibracoes_balanca (posto_id, peso_referencia, peso_lido, erro_percentual, aprovada, usuario_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [postoId, referencia, lido, erro.toFixed(3), aprovada ? 1 : 0, req.user.id]
      );
      const r = await dbQuery('SELECT * FROM calibracoes_balanca WHERE id = $1', [ins.raw.insertId]);
      io.emit('calibracao_registrada', r.rows[0]);
      return res.json({ ...r.rows[0], erro_maximo_percentual: CALIBRACAO_ERRO_MAX });
    } catch (err) {
      console.error('[Calibracao] Erro:', err.message);
      return res.status(500).json({ error: 'Falha ao registrar calibração' });
    }
  });

  router.get('/calibracoes', authMiddleware, async (req, res) => {
    try {
      const postoId = req.query.posto_id ? parseInt(req.query.posto_id, 10) : null;
      const r = postoId
        ? await dbQuery('SELECT * FROM calibracoes_balanca WHERE posto_id = $1 OR posto_id IS NULL ORDER BY criado_em DESC LIMIT 20', [postoId])
        : await dbQuery('SELECT * FROM calibracoes_balanca ORDER BY criado_em DESC LIMIT 20');
      return res.json(r.rows);
    } catch (_) {
      return res.json([]);
    }
  });

  // GET /api/validacoes — histórico com joins, para a tela de rastreabilidade
  router.get('/', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery(
        `SELECT v.*, p.nome AS produto_nome, p.sku AS produto_sku,
                e.codigo_qr, e.pedido_referencia, u.name AS usuario_nome,
                pv.nome AS posto_nome, pv.linha AS posto_linha, pv.codigo AS posto_codigo
         FROM validacoes v
         LEFT JOIN produtos p ON v.produto_esperado_id = p.id
         LEFT JOIN etiquetas e ON v.etiqueta_id = e.id
         LEFT JOIN users u ON v.usuario_id = u.id
         LEFT JOIN postos_validacao pv ON v.posto_id = pv.id
         ORDER BY v.criado_em DESC
         LIMIT 200`
      );
      return res.json(r.rows);
    } catch (err) {
      console.error('[Validacao] Erro em GET /api/validacoes:', err.message);
      return res.status(500).json({ error: 'Falha ao buscar validações' });
    }
  });

  // GET /api/validacoes/stats — KPIs do Antes x Depois
  router.get('/stats', authMiddleware, async (req, res) => {
    const vazio = {
      total: 0, aprovadas: 0, reprovadas: 0, reprovadas_abertas: 0, taxa_aprovacao: 0,
      retidas_antes_despacho: 0, tempo_medio_resolucao_min: null, validacoes_via_mqtt: 0,
      pesagens_manuais: 0, por_posto: [],
    };
    try {
      const geral = await dbQuery(
        `SELECT COUNT(*) AS total,
                SUM(resultado = 'aprovado') AS aprovadas,
                SUM(resultado = 'reprovado') AS reprovadas,
                SUM(resultado = 'reprovado' AND resolvido = 0) AS abertas,
                SUM(status_entrega = 'retido') AS retidas,
                SUM(origem = 'mqtt') AS via_mqtt,
                SUM(origem_peso = 'manual') AS manuais,
                AVG(CASE WHEN resolvido = 1 AND resolvido_em IS NOT NULL
                         THEN TIMESTAMPDIFF(SECOND, criado_em, resolvido_em) END) AS seg_resolucao
         FROM validacoes`
      );
      const g = geral.rows[0] || {};
      const porPosto = await dbQuery(
        `SELECT pv.id, pv.nome, pv.linha, pv.codigo,
                COUNT(v.id) AS total,
                SUM(v.resultado = 'reprovado') AS reprovadas
         FROM postos_validacao pv
         LEFT JOIN validacoes v ON v.posto_id = pv.id
         GROUP BY pv.id, pv.nome, pv.linha, pv.codigo
         ORDER BY pv.linha, pv.codigo`
      );
      const totalNum = Number(g.total || 0);
      const aprovadasNum = Number(g.aprovadas || 0);
      return res.json({
        total: totalNum,
        aprovadas: aprovadasNum,
        reprovadas: Number(g.reprovadas || 0),
        reprovadas_abertas: Number(g.abertas || 0),
        taxa_aprovacao: totalNum > 0 ? parseFloat(((aprovadasNum / totalNum) * 100).toFixed(1)) : 0,
        retidas_antes_despacho: Number(g.retidas || 0),
        tempo_medio_resolucao_min: g.seg_resolucao !== null && g.seg_resolucao !== undefined
          ? parseFloat((Number(g.seg_resolucao) / 60).toFixed(1)) : null,
        validacoes_via_mqtt: Number(g.via_mqtt || 0),
        pesagens_manuais: Number(g.manuais || 0),
        por_posto: porPosto.rows.map((p) => ({ ...p, total: Number(p.total || 0), reprovadas: Number(p.reprovadas || 0) })),
      });
    } catch (err) {
      console.warn('[Validacao] stats:', err.message);
      return res.json(vazio);
    }
  });

  return router;
};
