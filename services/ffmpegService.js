'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { getUploadsDir } = require('./uploadDir');

const CONNECT_TIMEOUT_US = 8 * 1000 * 1000; // 8s, em microssegundos (opção -timeout do ffmpeg)

/**
 * Abre um processo ffmpeg que lê um stream RTSP e escreve continuamente
 * um stream MJPEG (multipart/x-mixed-replace) em stdout — pronto para ser
 * escrito direto numa resposta HTTP e exibido por uma tag <img>.
 * @param {string} rtspUrl - ex: rtsp://admin:CHAVE@IP:554/cam/realmonitor?channel=1&subtype=0
 * @returns {import('child_process').ChildProcess}
 */
function spawnMjpegBridge(rtspUrl) {
  const args = [
    '-rtsp_transport', 'tcp',
    '-timeout', String(CONNECT_TIMEOUT_US),
    '-i', rtspUrl,
    '-f', 'mpjpeg',
    '-q:v', '5',
    '-r', '10',
    '-vf', 'scale=1280:-2',
    'pipe:1',
  ];
  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  return proc;
}

/**
 * Captura um único frame de um stream RTSP e salva como JPEG no diretório
 * de uploads. Retorna um objeto no mesmo formato usado pelo multer, para
 * ser reaproveitado por analisarMaterial()/decodeQrFromImage() sem mudanças.
 * @param {string} rtspUrl
 */
function captureRtspSnapshot(rtspUrl) {
  const uploadsDir = getUploadsDir();
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const filename = `rtsp_${Date.now()}.jpg`;
  const filepath = path.join(uploadsDir, filename);

  return new Promise((resolve, reject) => {
    const args = [
      '-rtsp_transport', 'tcp',
      '-timeout', String(CONNECT_TIMEOUT_US),
      '-i', rtspUrl,
      '-frames:v', '1',
      '-y',
      filepath,
    ];
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const killTimer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Timeout ao conectar na câmera RTSP'));
    }, CONNECT_TIMEOUT_US / 1000 + 2000);

    proc.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (code === 0 && fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
        resolve({
          fieldname: 'imagem', originalname: filename, filename, path: filepath,
          mimetype: 'image/jpeg', size: fs.statSync(filepath).size,
        });
      } else {
        reject(new Error('Falha ao capturar frame RTSP: ' + stderr.slice(-400)));
      }
    });
  });
}

module.exports = { spawnMjpegBridge, captureRtspSnapshot };
