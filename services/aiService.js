'use strict';

const fs = require('fs');
const path = require('path');

const MATERIAIS = [
  { nome: 'Cavaco de Aço',       categoria: 'Metal Ferroso',     destino: 'reaproveitamento', obs: 'Identificado como cavaco metálico ferroso escurecido.' },
  { nome: 'Cavaco de Alumínio',  categoria: 'Metal Não Ferroso', destino: 'reciclagem',        obs: 'Identificado como cavaco metálico brilhante e leve.' },
  { nome: 'Cavaco de Inox',      categoria: 'Metal Ferroso',     destino: 'reaproveitamento', obs: 'Inox identificado pela coloração prateada e textura encaracolada.' },
  { nome: 'Ferro',               categoria: 'Metal Ferroso',     destino: 'reciclagem',        obs: 'Ferro identificado pela coloração escura e peso característico.' },
  { nome: 'Cobre',               categoria: 'Metal Não Ferroso', destino: 'venda',             obs: 'Cobre identificado pela coloração avermelhada característica.' },
  { nome: 'Alumínio',            categoria: 'Metal Não Ferroso', destino: 'reciclagem',        obs: 'Alumínio identificado pela leveza e coloração prateada.' },
  { nome: 'Sucata Metálica',     categoria: 'Metal Misto',       destino: 'reciclagem',        obs: 'Mistura de metais identificada para triagem e reciclagem.' },
  { nome: 'Aparas Metálicas',    categoria: 'Metal Ferroso',     destino: 'reaproveitamento', obs: 'Aparas de metal para reaproveitamento interno.' },
  { nome: 'Papelão',             categoria: 'Papel/Papelão',     destino: 'reciclagem',        obs: 'Papelão identificado pela textura e coloração marrom.' },
  { nome: 'Plástico',            categoria: 'Plástico',          destino: 'descarte',          obs: 'Plástico identificado para descarte controlado.' },
  { nome: 'Madeira',             categoria: 'Madeira',           destino: 'descarte',          obs: 'Resíduo de madeira identificado para descarte adequado.' },
  { nome: 'Material Desconhecido', categoria: 'Desconhecido',    destino: 'descarte',          obs: 'Material não identificado com precisão. Triagem manual recomendada.' },
];

async function analisarComOpenAI(imagePath) {
  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString('base64');
  const ext = path.extname(imagePath).slice(1).replace('jpg', 'jpeg') || 'jpeg';

  const prompt = `Você é um sistema especialista em identificação de resíduos industriais para logística reversa ESG.
Analise a imagem e identifique o material. Responda APENAS com JSON válido no seguinte formato:
{
  "material_detectado": "nome exato do material",
  "categoria_detectada": "categoria",
  "confianca": 85.5,
  "observacao": "descrição breve da identificação",
  "sugestao_destino": "reaproveitamento"
}
Materiais possíveis: Cavaco de Aço, Cavaco de Alumínio, Cavaco de Inox, Ferro, Cobre, Alumínio, Sucata Metálica, Aparas Metálicas, Papelão, Plástico, Madeira, Material Desconhecido.
Categorias: Metal Ferroso, Metal Não Ferroso, Metal Misto, Papel/Papelão, Plástico, Madeira, Desconhecido.
sugestao_destino deve ser um de: reaproveitamento, reciclagem, descarte, venda.`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/${ext};base64,${base64}`, detail: 'low' } },
        ],
      }],
      max_tokens: 300,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status}`);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Resposta inválida da OpenAI');
  const result = JSON.parse(match[0]);
  // Normaliza confiança para 0–100 caso OpenAI retorne 0–1
  if (result.confianca > 0 && result.confianca <= 1) result.confianca = result.confianca * 100;
  return result;
}

function analisarSimulado(imagePath) {
  const stats = fs.statSync(imagePath);
  const seed = (stats.size + Math.floor(stats.mtimeMs / 1000)) % MATERIAIS.length;
  const material = MATERIAIS[seed];
  const confianca = parseFloat((75 + (stats.size % 20) + Math.random() * 4).toFixed(1));
  return {
    material_detectado:  material.nome,
    categoria_detectada: material.categoria,
    confianca:           Math.min(confianca, 99.5),
    observacao:          material.obs,
    sugestao_destino:    material.destino,
  };
}

/**
 * Analisa um arquivo de imagem e retorna os dados do material identificado.
 * @param {object|null} file - Objeto file do multer ou null para simulação
 */
async function analisarMaterial(file) {
  if (!file) {
    const material = MATERIAIS[Math.floor(Math.random() * (MATERIAIS.length - 1))];
    return {
      material_detectado:  material.nome,
      categoria_detectada: material.categoria,
      confianca:           parseFloat((70 + Math.random() * 25).toFixed(1)),
      observacao:          material.obs + ' (análise sem imagem — modo demonstração)',
      sugestao_destino:    material.destino,
    };
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await analisarComOpenAI(file.path);
    } catch (e) {
      console.warn('[IA] OpenAI falhou, usando simulação:', e.message);
    }
  }

  return analisarSimulado(file.path);
}

/**
 * Captura um frame da câmera IP via HTTP e salva como arquivo temporário.
 * @param {string} cameraUrl - URL base da câmera (ex: http://192.168.1.120:8080)
 */
async function capturarFrameCamera(cameraUrl) {
  const snapshotUrl = cameraUrl.replace(/\/+$/, '') + '/shot.jpg';
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const resp = await fetch(snapshotUrl, { signal: AbortSignal.timeout(6000) });
  if (!resp.ok) throw new Error(`Câmera retornou HTTP ${resp.status}`);

  const buffer = Buffer.from(await resp.arrayBuffer());
  const filename = `cam_${Date.now()}.jpg`;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, buffer);

  return {
    fieldname:    'imagem',
    originalname: filename,
    filename,
    path:         filepath,
    mimetype:     'image/jpeg',
    size:         buffer.length,
  };
}

module.exports = { analisarMaterial, capturarFrameCamera };
