'use strict';

/**
 * Ponte MQTT opcional para quando o gateway LoRa estiver disponível.
 * Só ativa se MQTT_BROKER_URL estiver definida no ambiente — sem ela,
 * o sistema continua funcionando normalmente pelo caminho HTTP existente
 * (POST /api/hardware/peso, câmera IP, etc.), sem mudanças de comportamento.
 *
 * Tópicos esperados quando o gateway existir:
 *   postos/<posto_id>/peso       -> { "peso": 2.45, "dispositivo": "Posto 01" }
 *   postos/<posto_id>/validacao  -> payload livre, repassado via Socket.IO
 */
function start(dbQuery, io) {
  const brokerUrl = process.env.MQTT_BROKER_URL;
  if (!brokerUrl) {
    console.log('[MQTT] MQTT_BROKER_URL não definida — ponte MQTT desativada (usando HTTP/Socket.IO existente).');
    return null;
  }

  const mqtt = require('mqtt');
  const client = mqtt.connect(brokerUrl, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
  });

  client.on('connect', () => {
    console.log('[MQTT] Conectado ao broker:', brokerUrl);
    client.subscribe(['postos/+/peso', 'postos/+/validacao'], (err) => {
      if (err) console.error('[MQTT] Falha ao assinar tópicos:', err.message);
    });
  });

  client.on('message', async (topic, messageBuffer) => {
    let payload;
    try {
      payload = JSON.parse(messageBuffer.toString());
    } catch {
      return console.warn('[MQTT] Mensagem ignorada (JSON inválido) em', topic);
    }

    const parts = topic.split('/'); // postos/<posto_id>/peso|validacao
    const postoId = parts[1];
    const canal = parts[2];

    if (canal === 'peso') {
      const peso = parseFloat(payload.peso);
      if (!isFinite(peso) || peso < 0) return;
      try {
        await dbQuery('INSERT INTO leituras_hardware (dispositivo_id, peso) VALUES ($1, $2)', [null, peso]);
      } catch (_) { /* tabela pode não existir ainda */ }
      io.emit('peso_atualizado', {
        peso,
        dispositivo: payload.dispositivo || `Posto ${postoId}`,
        timestamp: new Date().toISOString(),
      });
    } else if (canal === 'validacao') {
      io.emit('validacao_mqtt_recebida', { posto_id: postoId, ...payload });
    }
  });

  client.on('error', (err) => console.error('[MQTT] Erro de conexão:', err.message));

  return client;
}

module.exports = { start };
