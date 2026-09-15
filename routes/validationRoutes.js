'use strict';

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { decodeQrFromImage } = require('../services/qrService');
const { analisarMaterial, capturarFrameCamera } = require('../services/aiService');
const { getUploadsDir } = require('../services/uploadDir');

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

// Busca a etiqueta (pelo código do QR) e o produto esperado vinculado a ela.
async function buscarEtiquetaEProduto(dbQuery, codigoQr) {
  if (!codigoQr) return { etiqueta: null, produto: null };
  const r = await dbQuery(
    `SELECT e.id AS etiqueta_id, e.codigo_qr, e.pedido_referencia,
            p.id AS produto_id, p.sku, p.nome, p.categoria, p.peso_esperado_kg, p.tolerancia_kg
     FROM etiquetas e
     LEFT JOIN produtos p ON e.produto_id = p.id
     WHERE e.codigo_qr = $1
     LIMIT 1`,
    [codigoQr]
  );
  const row = r.rows[0];
  if (!row) return { etiqueta: null, produto: null };
  return {
    etiqueta: { id: row.etiqueta_id, codigo_qr: row.codigo_qr, pedido_referencia: row.pedido_referencia },
    produto: {
      id: row.produto_id, sku: row.sku, nome: row.nome, categoria: row.categoria,
      peso_esperado_kg: row.peso_esperado_kg !== null ? Number(row.peso_esperado_kg) : null,
      tolerancia_kg: row.tolerancia_kg !== null ? Number(row.tolerancia_kg) : null,
    },
  };
}

// Registro best-effort em analises_ia — não bloqueia a validação se falhar.
async function salvarAnaliseIA(dbQuery, dbClient, payload) {
  const { material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino } = payload;
  try {
    if (dbClient === 'mysql') {
      const ins = await dbQuery(
        'INSERT INTO analises_ia (material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino) VALUES ($1,$2,$3,$4,$5,$6)',
        [material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino || null]
      );
      return ins.raw.insertId;
    }
    const ins = await dbQuery(
      'INSERT INTO analises_ia (material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [material_detectado, categoria_detectada, confianca, observacao, imagem_url, sugestao_destino || null]
    );
    return ins.rows[0].id;
  } catch (e) {
    console.warn('[Validacao] Falha ao salvar análise de IA (não bloqueante):', e.message);
    return null;
  }
}

async function inserirValidacao(dbQuery, dbClient, v) {
  const cols = [
    'posto_id', 'etiqueta_id', 'produto_esperado_id', 'analise_ia_id', 'usuario_id',
    'peso_medido', 'qrcode_lido', 'imagem_url', 'resultado', 'motivo_divergencia',
  ];
  const values = cols.map((c) => (v[c] === undefined ? null : v[c]));
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');

  if (dbClient === 'mysql') {
    const ins = await dbQuery(`INSERT INTO validacoes (${cols.join(',')}) VALUES (${placeholders})`, values);
    const row = await dbQuery('SELECT * FROM validacoes WHERE id = $1', [ins.raw.insertId]);
    return row.rows[0];
  }
  const r = await dbQuery(`INSERT INTO validacoes (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`, values);
  return r.rows[0];
}

module.exports = function (dbQuery, dbClient, io, authMiddleware) {

  // ─────────────────────────────────────────────────────────
  // POST /api/validacoes — decide aprovado/reprovado
  // Form-data: imagem (file, opcional se camera_url for enviado)
  // Body:      peso_medido (obrigatório), posto_id (opcional), camera_url (opcional)
  //
  // Critérios de reprovação (peso + QR são os critérios definitivos;
  // a identificação por imagem é registrada para rastreabilidade, mas
  // não reprova sozinha — o catálogo de IA hoje é genérico e ainda não
  // foi treinado com fotos reais dos produtos da empresa):
  //   1) QR Code não encontrado na imagem
  //   2) QR Code não corresponde a nenhuma etiqueta cadastrada
  //   3) Peso medido fora da tolerância do produto esperado
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

      const imagemUrl = `/uploads/${file.filename}`;
      const [codigoQr, aiResult] = await Promise.all([
        decodeQrFromImage(file.path),
        analisarMaterial(file),
      ]);

      const analiseIaId = await salvarAnaliseIA(dbQuery, dbClient, { ...aiResult, imagem_url: imagemUrl });
      const { etiqueta, produto } = await buscarEtiquetaEProduto(dbQuery, codigoQr);

      let resultado = 'aprovado';
      const motivos = [];

      if (!codigoQr) {
        resultado = 'reprovado';
        motivos.push('QR Code não detectado na imagem.');
      } else if (!etiqueta) {
        resultado = 'reprovado';
        motivos.push(`QR Code "${codigoQr}" não corresponde a nenhuma etiqueta cadastrada.`);
      } else if (produto && produto.peso_esperado_kg !== null) {
        const tolerancia = produto.tolerancia_kg ?? 0;
        const diff = Math.abs(pesoMedido - produto.peso_esperado_kg);
        if (diff > tolerancia) {
          resultado = 'reprovado';
          motivos.push(
            `Peso medido (${pesoMedido.toFixed(3)} kg) fora da tolerância esperada para "${produto.nome}" ` +
            `(esperado ${produto.peso_esperado_kg.toFixed(3)} kg ± ${tolerancia.toFixed(3)} kg).`
          );
        }
      }

      const validacao = await inserirValidacao(dbQuery, dbClient, {
        posto_id: posto_id || null,
        etiqueta_id: etiqueta ? etiqueta.id : null,
        produto_esperado_id: produto ? produto.id : null,
        analise_ia_id: analiseIaId,
        usuario_id: req.user.id,
        peso_medido: pesoMedido,
        qrcode_lido: codigoQr,
        imagem_url: imagemUrl,
        resultado,
        motivo_divergencia: motivos.join(' ') || null,
      });

      const payload = {
        ...validacao,
        produto_nome: produto ? produto.nome : null,
        produto_sku: produto ? produto.sku : null,
        ia: aiResult,
      };

      io.emit('validacao_concluida', payload);
      return res.json(payload);
    } catch (err) {
      console.error('[Validacao] Erro em POST /api/validacoes:', err.message);
      return res.status(500).json({ error: 'Falha ao processar validação: ' + err.message });
    }
  });

  // GET /api/validacoes/postos — lista de postos de validação cadastrados
  router.get('/postos', authMiddleware, async (req, res) => {
    try {
      const r = await dbQuery('SELECT * FROM postos_validacao ORDER BY nome');
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
                e.codigo_qr, e.pedido_referencia, u.name AS usuario_nome
         FROM validacoes v
         LEFT JOIN produtos p ON v.produto_esperado_id = p.id
         LEFT JOIN etiquetas e ON v.etiqueta_id = e.id
         LEFT JOIN users u ON v.usuario_id = u.id
         ORDER BY v.criado_em DESC
         LIMIT 200`
      );
      return res.json(r.rows);
    } catch (err) {
      console.error('[Validacao] Erro em GET /api/validacoes:', err.message);
      return res.status(500).json({ error: 'Falha ao buscar validações' });
    }
  });

  // GET /api/validacoes/stats — KPIs para o dashboard
  router.get('/stats', authMiddleware, async (req, res) => {
    try {
      const total     = await dbQuery('SELECT COUNT(*) as total FROM validacoes');
      const aprovadas = await dbQuery("SELECT COUNT(*) as total FROM validacoes WHERE resultado = 'aprovado'");
      const reprovadas = await dbQuery("SELECT COUNT(*) as total FROM validacoes WHERE resultado = 'reprovado'");
      const totalNum = Number(total.rows[0]?.total || 0);
      const aprovadasNum = Number(aprovadas.rows[0]?.total || 0);
      const reprovadasNum = Number(reprovadas.rows[0]?.total || 0);

      return res.json({
        total: totalNum,
        aprovadas: aprovadasNum,
        reprovadas: reprovadasNum,
        taxa_aprovacao: totalNum > 0 ? parseFloat(((aprovadasNum / totalNum) * 100).toFixed(1)) : 0,
      });
    } catch (_) {
      return res.json({ total: 0, aprovadas: 0, reprovadas: 0, taxa_aprovacao: 0 });
    }
  });

  return router;
};
