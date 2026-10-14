'use strict';

const fs = require('fs');
const path = require('path');
const { decodeQrFromImage } = require('./qrService');
const { analisarMaterial, verificarImagemProduto, capturarFrameCamera } = require('./aiService');
const { getUploadsDir } = require('./uploadDir');
const { notificarValidacao } = require('./notificationService');

// Validade da calibração da balança e se uma balança vencida reprova a caixa.
const CALIBRACAO_VALIDADE_DIAS = Number(process.env.CALIBRACAO_VALIDADE_DIAS || 7);
const CALIBRACAO_OBRIGATORIA = String(process.env.CALIBRACAO_OBRIGATORIA || '').toLowerCase() === 'true';
// Confiança mínima para a divergência por imagem reprovar a caixa.
const IMAGEM_CONFIANCA_MIN = Number(process.env.IMAGEM_CONFIANCA_MIN || 60);

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
    produto: row.produto_id === null ? null : {
      id: row.produto_id, sku: row.sku, nome: row.nome, categoria: row.categoria,
      peso_esperado_kg: row.peso_esperado_kg !== null ? Number(row.peso_esperado_kg) : null,
      tolerancia_kg: row.tolerancia_kg !== null ? Number(row.tolerancia_kg) : null,
    },
  };
}

async function buscarPosto(dbQuery, postoId) {
  if (!postoId) return null;
  try {
    const r = await dbQuery('SELECT * FROM postos_validacao WHERE id = $1', [postoId]);
    return r.rows[0] || null;
  } catch (_) { return null; }
}

// Calibração aprovada mais recente do posto (ou geral, sem posto) dentro da validade.
async function calibracaoValida(dbQuery, postoId) {
  try {
    const r = await dbQuery(
      `SELECT criado_em FROM calibracoes_balanca
       WHERE aprovada = 1 AND (posto_id = $1 OR posto_id IS NULL)
       ORDER BY criado_em DESC LIMIT 1`,
      [postoId || null]
    );
    const ultima = r.rows[0];
    if (!ultima) return false;
    const idadeDias = (Date.now() - new Date(ultima.criado_em).getTime()) / 86400000;
    return idadeDias <= CALIBRACAO_VALIDADE_DIAS;
  } catch (_) { return null; }
}

/**
 * Captura a imagem da câmera vinculada ao posto — usado quando a validação
 * chega por MQTT (o posto publica só peso + id da caixa; a foto vem da
 * câmera do próprio posto).
 */
async function capturarImagemDoPosto(dbQuery, posto) {
  if (!posto || !posto.camera_id) return null;
  try {
    const r = await dbQuery('SELECT * FROM cameras WHERE id = $1', [posto.camera_id]);
    const camera = r.rows[0];
    if (!camera) return null;
    const uploadsDir = getUploadsDir();
    if (camera.modo_conexao === 'push') {
      const live = path.join(uploadsDir, `camera_live_${camera.id}.jpg`);
      if (!fs.existsSync(live) || Date.now() - fs.statSync(live).mtimeMs > 15000) return null;
      const filename = `val_${Date.now()}_${Math.round(Math.random() * 1e6)}.jpg`;
      const filepath = path.join(uploadsDir, filename);
      fs.copyFileSync(live, filepath);
      return { fieldname: 'imagem', originalname: filename, filename, path: filepath, mimetype: 'image/jpeg', size: fs.statSync(filepath).size };
    }
    return await capturarFrameCamera(camera.url_stream);
  } catch (e) {
    console.warn('[Validacao] Não foi possível capturar a câmera do posto:', e.message);
    return null;
  }
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
    'status_entrega', 'origem', 'origem_peso', 'imagem_confere', 'imagem_confianca', 'balanca_calibrada',
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

const SELECT_VALIDACAO = `
  SELECT v.*, p.nome AS produto_nome, p.sku AS produto_sku, e.codigo_qr, e.pedido_referencia,
         pv.nome AS posto_nome, pv.linha AS posto_linha, pv.codigo AS posto_codigo
  FROM validacoes v
  LEFT JOIN produtos p ON v.produto_esperado_id = p.id
  LEFT JOIN etiquetas e ON v.etiqueta_id = e.id
  LEFT JOIN postos_validacao pv ON v.posto_id = pv.id`;

async function buscarValidacao(dbQuery, id) {
  const r = await dbQuery(`${SELECT_VALIDACAO} WHERE v.id = $1`, [id]);
  return r.rows[0] || null;
}

/**
 * Decide aprovado/reprovado cruzando as três fontes: QR Code (etiqueta),
 * peso (balança) e imagem (o item confere com o produto da etiqueta).
 *
 * input = {
 *   file        — imagem (objeto estilo multer) ou null,
 *   codigoQr    — id da caixa lido no posto (MQTT); se ausente, lê da imagem,
 *   pesoMedido, origemPeso ('balanca'|'manual'), origem ('web'|'mqtt'),
 *   postoId, usuarioId
 * }
 */
async function executarValidacao({ dbQuery, dbClient, io }, input) {
  const posto = await buscarPosto(dbQuery, input.postoId);
  let file = input.file || null;
  if (!file && input.origem === 'mqtt') file = await capturarImagemDoPosto(dbQuery, posto);

  const imagemUrl = file ? `/uploads/${file.filename}` : null;
  const [qrDaImagem, aiResult] = await Promise.all([
    !input.codigoQr && file ? decodeQrFromImage(file.path) : Promise.resolve(null),
    file ? analisarMaterial(file) : Promise.resolve(null),
  ]);
  const codigoQr = input.codigoQr || qrDaImagem;
  const analiseIaId = aiResult ? await salvarAnaliseIA(dbQuery, dbClient, { ...aiResult, imagem_url: imagemUrl }) : null;
  const { etiqueta, produto } = await buscarEtiquetaEProduto(dbQuery, codigoQr);

  const [verificacaoImagem, calibrada] = await Promise.all([
    file && produto ? verificarImagemProduto(file.path, produto) : Promise.resolve(null),
    calibracaoValida(dbQuery, posto ? posto.id : null),
  ]);

  const motivos = [];
  const avisos = [];
  const pesoMedido = input.pesoMedido;
  // Situação de cada fonte do cruzamento: 'ok' | 'falhou' | 'nao_verificado'
  const criterios = { qr: 'ok', peso: 'nao_verificado', imagem: 'nao_verificado' };

  // 1) Identificador único da caixa
  if (!codigoQr) {
    criterios.qr = 'falhou';
    motivos.push('QR Code não detectado.');
  } else if (!etiqueta) {
    criterios.qr = 'falhou';
    motivos.push(`QR Code "${codigoQr}" não corresponde a nenhuma etiqueta cadastrada.`);
  }

  // 2) Peso contra o produto da etiqueta
  if (produto && produto.peso_esperado_kg !== null) {
    const tolerancia = produto.tolerancia_kg ?? 0;
    const diff = Math.abs(pesoMedido - produto.peso_esperado_kg);
    criterios.peso = diff > tolerancia ? 'falhou' : 'ok';
    if (diff > tolerancia) {
      motivos.push(
        `Peso medido (${pesoMedido.toFixed(3)} kg) fora da tolerância esperada para "${produto.nome}" ` +
        `(esperado ${produto.peso_esperado_kg.toFixed(3)} kg ± ${tolerancia.toFixed(3)} kg).`
      );
    }
  }

  // 3) Imagem contra o produto da etiqueta
  if (verificacaoImagem) {
    if (verificacaoImagem.confere) criterios.imagem = 'ok';
    else criterios.imagem = verificacaoImagem.confianca >= IMAGEM_CONFIANCA_MIN ? 'falhou' : 'nao_verificado';
  }
  if (verificacaoImagem && !verificacaoImagem.confere && verificacaoImagem.confianca >= IMAGEM_CONFIANCA_MIN) {
    motivos.push(`Imagem não confere com "${produto.nome}": ${verificacaoImagem.observacao}`.trim());
  } else if (!verificacaoImagem && etiqueta) {
    avisos.push(file ? 'Imagem não verificada (serviço de visão indisponível).' : 'Validação sem imagem do item.');
  }

  // Confiabilidade da pesagem
  if (calibrada === false) {
    if (CALIBRACAO_OBRIGATORIA) motivos.push(`Balança sem calibração válida nos últimos ${CALIBRACAO_VALIDADE_DIAS} dias.`);
    else avisos.push(`Balança sem calibração válida nos últimos ${CALIBRACAO_VALIDADE_DIAS} dias.`);
  }
  if (input.origemPeso === 'manual') avisos.push('Peso digitado manualmente (não veio da balança).');

  const resultado = motivos.length ? 'reprovado' : 'aprovado';

  const validacao = await inserirValidacao(dbQuery, dbClient, {
    posto_id: posto ? posto.id : null,
    etiqueta_id: etiqueta ? etiqueta.id : null,
    produto_esperado_id: produto ? produto.id : null,
    analise_ia_id: analiseIaId,
    usuario_id: input.usuarioId || null,
    peso_medido: pesoMedido,
    qrcode_lido: codigoQr,
    imagem_url: imagemUrl,
    resultado,
    motivo_divergencia: motivos.join(' ') || null,
    // Reprovada = caixa retida no posto; não pode seguir para o despacho.
    status_entrega: resultado === 'reprovado' ? 'retido' : 'expedido',
    origem: input.origem || 'web',
    origem_peso: input.origemPeso || 'balanca',
    imagem_confere: verificacaoImagem ? (verificacaoImagem.confere ? 1 : 0) : null,
    imagem_confianca: verificacaoImagem ? verificacaoImagem.confianca : null,
    balanca_calibrada: calibrada === null ? null : (calibrada ? 1 : 0),
  });

  // Caixa corrigida e revalidada com sucesso: as retenções anteriores da
  // mesma etiqueta ficam resolvidas automaticamente.
  if (resultado === 'aprovado' && etiqueta) {
    try {
      const abertas = await dbQuery(
        "SELECT id FROM validacoes WHERE etiqueta_id = $1 AND resultado = 'reprovado' AND resolvido = 0 AND id <> $2",
        [etiqueta.id, validacao.id]
      );
      for (const row of abertas.rows) {
        await dbQuery('UPDATE validacoes SET resolvido = 1, resolvido_em = NOW(), resolvido_por = $1 WHERE id = $2', [input.usuarioId || null, row.id]);
        const atualizada = await buscarValidacao(dbQuery, row.id);
        if (atualizada) io.emit('validacao_resolvida', atualizada);
      }
    } catch (e) {
      console.warn('[Validacao] Falha ao liberar retenções anteriores:', e.message);
    }
  }

  const payload = {
    ...validacao,
    produto_nome: produto ? produto.nome : null,
    produto_sku: produto ? produto.sku : null,
    codigo_qr: etiqueta ? etiqueta.codigo_qr : null,
    pedido_referencia: etiqueta ? etiqueta.pedido_referencia : null,
    posto_nome: posto ? posto.nome : null,
    posto_linha: posto ? posto.linha : null,
    posto_codigo: posto ? posto.codigo : null,
    ia: aiResult,
    verificacao_imagem: verificacaoImagem,
    criterios,
    avisos,
  };

  io.emit('validacao_concluida', payload);
  notificarValidacao(payload);
  return payload;
}

module.exports = { executarValidacao, buscarValidacao, SELECT_VALIDACAO };
