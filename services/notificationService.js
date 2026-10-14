'use strict';

const webpush = require('web-push');

/**
 * Saída dos resultados de validação para quem não está com o site aberto:
 *   - MQTT: <linha>/<posto>/resultado (todas) e alertas/<linha>/<posto>
 *     (só reprovações) — assinados pelo app Android e por outros sistemas.
 *   - Web Push: notificação no celular/navegador do gestor mesmo com o
 *     app fechado (PWA instalado).
 * Tudo aqui é best-effort: uma falha de notificação nunca derruba a validação.
 */

let mqttClient = null;
let pushReady = false;
let dbQueryRef = null;

function setMqttClient(client) {
  mqttClient = client;
}

async function lerConfig(dbQuery, chave) {
  try {
    const r = await dbQuery('SELECT valor FROM configuracoes_sistema WHERE chave = $1', [chave]);
    return r.rows[0] ? r.rows[0].valor : null;
  } catch (_) { return null; }
}

async function salvarConfig(dbQuery, chave, valor) {
  try {
    await dbQuery('INSERT INTO configuracoes_sistema (chave, valor) VALUES ($1, $2)', [chave, valor]);
  } catch (_) { /* já existe ou tabela ausente */ }
}

// Chaves VAPID: do ambiente, ou geradas uma vez e guardadas no banco para
// que as inscrições dos celulares continuem válidas entre deploys.
async function initPush(dbQuery) {
  dbQueryRef = dbQuery;
  try {
    let publicKey = process.env.VAPID_PUBLIC_KEY || await lerConfig(dbQuery, 'vapid_public_key');
    let privateKey = process.env.VAPID_PRIVATE_KEY || await lerConfig(dbQuery, 'vapid_private_key');
    if (!publicKey || !privateKey) {
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      await salvarConfig(dbQuery, 'vapid_public_key', publicKey);
      await salvarConfig(dbQuery, 'vapid_private_key', privateKey);
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@ecoengineers.local', publicKey, privateKey);
    pushReady = true;
    module.exports.vapidPublicKey = publicKey;
    console.log('[Push] Web Push pronto.');
  } catch (e) {
    console.warn('[Push] Web Push desativado:', e.message);
  }
}

function topicoBase(v) {
  return `${v.posto_linha || 'linha-01'}/${v.posto_codigo || 'posto-00'}`;
}

function publicarMqtt(v) {
  if (!mqttClient || !mqttClient.connected) return;
  const msg = JSON.stringify({
    id: v.id,
    caixa: v.qrcode_lido,
    produto: v.produto_nome,
    resultado: v.resultado,
    motivo: v.motivo_divergencia,
    peso: v.peso_medido !== null ? Number(v.peso_medido) : null,
    status_entrega: v.status_entrega,
    ts: v.criado_em || new Date().toISOString(),
  });
  const base = topicoBase(v);
  mqttClient.publish(`${base}/resultado`, msg, { qos: 1 });
  if (v.resultado === 'reprovado') {
    mqttClient.publish(`alertas/${base}`, msg, { qos: 1 });
  }
}

async function enviarPush(v) {
  if (!pushReady || !dbQueryRef || v.resultado !== 'reprovado') return;
  let subs = [];
  try {
    // Só existe inscrição de quem ativou os alertas em Configurações.
    const r = await dbQueryRef('SELECT * FROM push_subscriptions');
    subs = r.rows;
  } catch (_) { return; }

  const payload = JSON.stringify({
    title: `Caixa ${v.qrcode_lido || '#' + v.id} reprovada`,
    body: v.motivo_divergencia || 'Divergência entre item, peso e QR Code.',
    tag: `validacao-${v.id}`,
    url: '/tracking',
  });

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    } catch (e) {
      // 404/410 = inscrição expirada (app desinstalado, permissão revogada).
      if (e.statusCode === 404 || e.statusCode === 410) {
        try { await dbQueryRef('DELETE FROM push_subscriptions WHERE id = $1', [s.id]); } catch (_) {}
      }
    }
  }));
}

function notificarValidacao(v) {
  try { publicarMqtt(v); } catch (e) { console.warn('[MQTT] Falha ao publicar resultado:', e.message); }
  enviarPush(v).catch((e) => console.warn('[Push] Falha ao enviar:', e.message));
}

module.exports = { setMqttClient, initPush, notificarValidacao, vapidPublicKey: null };
