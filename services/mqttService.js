'use strict';

const crypto = require('crypto');
const net = require('net');
const jwt = require('jsonwebtoken');
const { setMqttClient } = require('./notificationService');
const { executarValidacao } = require('./validationEngine');

/**
 * MQTT da arquitetura da pré-banca:
 *
 *   Posto (ESP32 + balança + leitor de QR) --Wi-Fi/MQTT--> Broker --> Backend / App Android
 *
 * Broker:
 *   - MQTT_BROKER_URL definida  -> usa um broker externo (Mosquitto, HiveMQ...).
 *   - sem MQTT_BROKER_URL        -> sobe um broker embutido (aedes) neste mesmo
 *     servidor: TCP em MQTT_PORT (padrão 1883, rede local dos postos) e WebSocket
 *     em /mqtt no próprio servidor HTTP (funciona no Azure, porta 443).
 *     MQTT_EMBEDDED=false desliga o broker embutido.
 *
 * Autenticação no broker embutido:
 *   - posto (ESP32):  usuário "hardware", senha = HARDWARE_API_KEY (publica e assina)
 *   - app/site:      qualquer usuário, senha = token JWT do login (só assina)
 *
 * Tópicos (exemplo do slide: linha-01/posto-03/validacao):
 *   <linha>/<posto>/validacao  <- posto: { "caixa": "ECO-QR-...", "peso": 2.45 }
 *   <linha>/<posto>/peso       <- posto: { "peso": 2.45 } (leitura ao vivo)
 *   <linha>/<posto>/resultado  -> backend: resultado de toda validação
 *   alertas/<linha>/<posto>    -> backend: só reprovações (app Android assina)
 *   postos/<id>/peso|validacao <- formato antigo, ainda aceito
 */

function iniciarBrokerEmbutido(httpServer, internalToken) {
  const Aedes = require('aedes');
  const { WebSocketServer, createWebSocketStream } = require('ws');
  const broker = Aedes();
  const hardwareKey = process.env.HARDWARE_API_KEY;
  const jwtSecret = process.env.JWT_SECRET;

  broker.authenticate = (client, username, password, done) => {
    const senha = password ? password.toString() : '';
    if (username === '__backend__' && senha === internalToken) {
      client.papel = 'backend';
      return done(null, true);
    }
    if (username === 'hardware' && hardwareKey && senha === hardwareKey) {
      client.papel = 'hardware';
      return done(null, true);
    }
    try {
      jwt.verify(senha, jwtSecret);
      client.papel = 'app';
      return done(null, true);
    } catch (_) {
      const err = new Error('Credenciais inválidas');
      err.returnCode = 4;
      return done(err, false);
    }
  };

  // App/site só escutam; quem publica é o hardware (posto) e o backend.
  broker.authorizePublish = (client, packet, done) => {
    if (client && (client.papel === 'hardware' || client.papel === 'backend')) return done(null);
    return done(new Error('Publicação não autorizada para este cliente'));
  };

  const porta = Number(process.env.MQTT_PORT || 1883);
  const tcp = net.createServer(broker.handle);
  tcp.on('error', (e) => console.warn(`[MQTT] Broker TCP indisponível na porta ${porta}:`, e.message));
  tcp.listen(porta, () => console.log(`[MQTT] Broker embutido escutando TCP :${porta}`));

  // WebSocket em /mqtt no mesmo servidor HTTP — sem conflito com o Socket.IO.
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/mqtt')) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      broker.handle(createWebSocketStream(ws));
    });
  });
  console.log('[MQTT] Broker embutido disponível via WebSocket em /mqtt');

  return { broker, url: `mqtt://127.0.0.1:${porta}` };
}

async function buscarPostoPorTopico(dbQuery, prefixo, chave) {
  try {
    if (prefixo === 'postos') {
      const r = await dbQuery('SELECT * FROM postos_validacao WHERE id = $1', [parseInt(chave, 10) || 0]);
      return r.rows[0] || null;
    }
    const r = await dbQuery('SELECT * FROM postos_validacao WHERE linha = $1 AND codigo = $2', [prefixo, chave]);
    return r.rows[0] || null;
  } catch (_) { return null; }
}

function start(dbQuery, dbClient, io, httpServer) {
  const externo = process.env.MQTT_BROKER_URL;
  const embutidoLigado = String(process.env.MQTT_EMBEDDED || 'true').toLowerCase() !== 'false';
  if (!externo && !embutidoLigado) {
    console.log('[MQTT] Desativado (MQTT_EMBEDDED=false e sem MQTT_BROKER_URL).');
    return null;
  }

  let brokerUrl = externo;
  let opcoes = {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
  };
  if (!externo) {
    const internalToken = crypto.randomBytes(24).toString('hex');
    brokerUrl = iniciarBrokerEmbutido(httpServer, internalToken).url;
    opcoes = { username: '__backend__', password: internalToken };
  }

  const mqtt = require('mqtt');
  const client = mqtt.connect(brokerUrl, { ...opcoes, clientId: `backend-${process.pid}`, reconnectPeriod: 3000 });
  setMqttClient(client);

  client.on('connect', () => {
    console.log('[MQTT] Backend conectado ao broker:', externo ? brokerUrl : 'embutido');
    client.subscribe(['+/+/peso', '+/+/validacao'], { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Falha ao assinar tópicos:', err.message);
    });
  });

  client.on('message', async (topic, messageBuffer) => {
    const parts = topic.split('/');
    if (parts.length !== 3) return;
    const [prefixo, chave, canal] = parts;

    let payload;
    try {
      payload = JSON.parse(messageBuffer.toString());
    } catch {
      return console.warn('[MQTT] Mensagem ignorada (JSON inválido) em', topic);
    }

    const peso = parseFloat(payload.peso);
    const posto = await buscarPostoPorTopico(dbQuery, prefixo, chave);

    if (canal === 'peso') {
      if (!isFinite(peso) || peso < 0) return;
      try {
        await dbQuery('INSERT INTO leituras_hardware (dispositivo_id, peso) VALUES ($1, $2)', [null, peso]);
      } catch (_) { /* tabela pode não existir ainda */ }
      io.emit('peso_atualizado', {
        peso,
        dispositivo: payload.dispositivo || (posto ? posto.nome : `${prefixo}/${chave}`),
        posto_id: posto ? posto.id : null,
        origem: 'mqtt',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (canal === 'validacao') {
      const caixa = payload.caixa || payload.codigo_qr || payload.qrcode || null;
      if (!isFinite(peso) || peso < 0) {
        return console.warn('[MQTT] Validação sem peso válido em', topic);
      }
      if (!posto) console.warn(`[MQTT] Posto ${prefixo}/${chave} não cadastrado — validação registrada sem posto.`);
      try {
        const v = await executarValidacao({ dbQuery, dbClient, io }, {
          file: null,
          codigoQr: caixa ? String(caixa) : null,
          pesoMedido: peso,
          origemPeso: 'balanca',
          origem: 'mqtt',
          postoId: posto ? posto.id : null,
          usuarioId: null,
        });
        // Garante o tópico de resposta mesmo para posto não cadastrado.
        if (!posto) {
          client.publish(`${prefixo}/${chave}/resultado`, JSON.stringify({ id: v.id, caixa: v.qrcode_lido, resultado: v.resultado, motivo: v.motivo_divergencia }), { qos: 1 });
        }
      } catch (e) {
        console.error('[MQTT] Falha ao validar mensagem de', topic, e.message);
      }
    }
  });

  client.on('error', (err) => console.error('[MQTT] Erro de conexão:', err.message));

  return client;
}

module.exports = { start };
