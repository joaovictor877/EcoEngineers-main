#!/usr/bin/env node
'use strict';

/**
 * Simula um posto de embalagem publicando no broker MQTT exatamente como o
 * firmware hardware/posto_wifi_mqtt faria — para demonstrar o caminho
 * posto -> MQTT -> servidor -> app sem a placa física.
 *
 * Uso:
 *   node scripts/simular-posto-mqtt.js --url wss://ecoengineers.azurewebsites.net/mqtt \
 *        --key SUA_HARDWARE_API_KEY --linha linha-01 --posto posto-01 \
 *        --caixa ECO-QR-SKU-1001-0001 --peso 2.51
 *
 * Sem --caixa/--peso, envia uma caixa correta e depois uma com peso errado.
 * Local: --url mqtt://localhost:1883
 */

const mqtt = require('mqtt');

function arg(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const url = arg('url', 'mqtt://localhost:1883');
const key = arg('key', process.env.HARDWARE_API_KEY || '');
const linha = arg('linha', 'linha-01');
const posto = arg('posto', 'posto-01');
const base = `${linha}/${posto}`;

const envios = arg('caixa')
  ? [{ caixa: arg('caixa'), peso: parseFloat(arg('peso', '0')) }]
  : [
      { caixa: 'ECO-QR-SKU-1001-0001', peso: 2.51 },  // confere (2,500 ± 0,050 kg)
      { caixa: 'ECO-QR-SKU-1001-0001', peso: 3.20 },  // peso diverge -> retida
    ];

const client = mqtt.connect(url, { username: 'hardware', password: key, reconnectPeriod: 0 });

client.on('connect', async () => {
  console.log(`[posto simulado] conectado a ${url}`);
  client.subscribe(`${base}/resultado`);
  for (const envio of envios) {
    const msg = JSON.stringify(envio);
    client.publish(`${base}/validacao`, msg, { qos: 1 });
    console.log(`[posto simulado] publicou ${base}/validacao ${msg}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  setTimeout(() => client.end(), 4000);
});

client.on('message', (topic, m) => {
  const r = JSON.parse(m.toString());
  console.log(`[posto simulado] ${topic}: caixa ${r.caixa} ${r.resultado.toUpperCase()}${r.motivo ? ' — ' + r.motivo : ''}`);
  console.log(`[posto simulado] LED ${r.resultado === 'aprovado' ? 'verde' : 'vermelho'}`);
});

client.on('error', (e) => {
  console.error('[posto simulado] erro:', e.message);
  process.exit(1);
});
