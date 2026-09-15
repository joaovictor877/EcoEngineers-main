'use strict';

const jsQR = require('jsqr');
const { Jimp } = require('jimp');

/**
 * Decodifica o QR Code presente em um arquivo de imagem.
 * @param {string} filePath - caminho local do arquivo (jpg/png).
 * @returns {Promise<string|null>} texto do QR ou null se nenhum QR foi encontrado.
 */
async function decodeQrFromImage(filePath) {
  try {
    const image = await Jimp.read(filePath);
    const { data, width, height } = image.bitmap;
    const code = jsQR(new Uint8ClampedArray(data), width, height);
    return code ? code.data : null;
  } catch (e) {
    console.warn('[QR] Falha ao decodificar imagem:', e.message);
    return null;
  }
}

module.exports = { decodeQrFromImage };
