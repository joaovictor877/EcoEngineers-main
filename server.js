require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server: SocketServer } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getUploadsDir } = require('./services/uploadDir');

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const dbSchema = process.env.DB_SCHEMA || 'public';
const dbSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const dbClient = (process.env.DB_CLIENT || (String(databaseUrl).startsWith('mysql') ? 'mysql' : 'postgres')).toLowerCase();

if (!databaseUrl) {
  console.error('Missing DATABASE_URL in environment variables.');
  process.exit(1);
}

if (!jwtSecret) {
  console.error('Missing JWT_SECRET in environment variables.');
  process.exit(1);
}

let pool;

if (dbClient === 'mysql') {
  pool = mysql.createPool({
    uri: databaseUrl,
    ssl: dbSsl ? {} : undefined,
    waitForConnections: true,
    connectionLimit: 10
  });
} else {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: dbSsl ? { rejectUnauthorized: false } : false
  });
}

function sanitizeIdentifier(value) {
  return String(value).replace(/[^a-zA-Z0-9_]/g, '');
}

function toMysqlPlaceholders(sql) {
  return sql.replace(/\$\d+/g, '?');
}

async function dbQuery(sql, params = []) {
  if (dbClient === 'mysql') {
    const [result] = await pool.query(toMysqlPlaceholders(sql), params);
    return { rows: result, raw: result };
  }
  const result = await pool.query(sql, params);
  return { rows: result.rows, raw: result };
}

if (dbClient === 'postgres') {
  pool.on('connect', async (client) => {
    const schema = sanitizeIdentifier(dbSchema) || 'public';
    await client.query(`SET search_path TO ${schema}, public`);
  });
}

const app = express();
const httpServer = http.createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
});

io.on('connection', (socket) => {
  console.log('[Socket.IO] Cliente conectado:', socket.id);
  socket.on('disconnect', () => console.log('[Socket.IO] Desconectado:', socket.id));
});

app.use(cors());
app.use(express.json());

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).send({ error: 'No token' });
  const token = auth.split(' ')[1];
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (e) {
    res.status(401).send({ error: 'Invalid token' });
  }
}

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = await dbQuery('SELECT now() AS now');
    res.json({
      status: 'ok',
      db: 'connected',
      client: dbClient,
      schema: dbSchema,
      serverTime: db.rows[0].now || null
    });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', client: dbClient });
  }
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    const hash = await bcrypt.hash(password, 10);
    if (dbClient === 'mysql') {
      const insert = await dbQuery('INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3)', [name, email, hash]);
      const user = await dbQuery('SELECT id,name,email,role FROM users WHERE id = $1', [insert.raw.insertId]);
      return res.json(user.rows[0]);
    }
    const result = await dbQuery('INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id,name,email,role', [name, email, hash]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email e senha são obrigatórios' });
    }
    const r = await dbQuery('SELECT * FROM users WHERE email = $1', [email]);
    const user = r.rows[0];
    if (!user) {
      return res.status(401).json({
        error: 'Não encontramos uma conta com este email.',
        code: 'EMAIL_NOT_FOUND',
      });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({
        error: 'Senha incorreta. Verifique e tente novamente.',
        code: 'WRONG_PASSWORD',
      });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, nome: user.name, cargo: user.cargo || '', setor: user.setor || '' },
      jwtSecret,
      { expiresIn: '8h' }
    );
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha no servidor. Tente novamente.' });
  }
});

// Materials
app.get('/api/materials', authMiddleware, async (req, res) => {
  try {
    const r = await dbQuery('SELECT * FROM materials ORDER BY name');
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get materials' });
  }
});

app.post('/api/materials', authMiddleware, async (req, res) => {
  try {
    const { name, category, unit } = req.body;
    if (dbClient === 'mysql') {
      const insert = await dbQuery('INSERT INTO materials (name,category,unit) VALUES ($1,$2,$3)', [name, category, unit || 'kg']);
      const row = await dbQuery('SELECT * FROM materials WHERE id = $1', [insert.raw.insertId]);
      return res.json(row.rows[0]);
    }
    const r = await dbQuery('INSERT INTO materials (name,category,unit) VALUES ($1,$2,$3) RETURNING *', [name, category, unit || 'kg']);
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create material' });
  }
});

// PUT /api/materials/:id
app.put('/api/materials/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    const { name, category, unit } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    await dbQuery('UPDATE materials SET name=$1, category=$2, unit=$3 WHERE id=$4', [name, category || '', unit || 'kg', id]);
    const r = await dbQuery('SELECT * FROM materials WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Material não encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update material' });
  }
});

// DELETE /api/materials/:id
app.delete('/api/materials/:id', authMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    await dbQuery('DELETE FROM materials WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// Wastes
app.post('/api/wastes', authMiddleware, async (req, res) => {
  try {
    const { material_id, quantity, location, value } = req.body;
    if (dbClient === 'mysql') {
      const insert = await dbQuery('INSERT INTO wastes (user_id, material_id, quantity, location, value) VALUES ($1,$2,$3,$4,$5)', [req.user.id, material_id, quantity, location, value || 0]);
      const row = await dbQuery('SELECT * FROM wastes WHERE id = $1', [insert.raw.insertId]);
      return res.json(row.rows[0]);
    }
    const r = await dbQuery('INSERT INTO wastes (user_id, material_id, quantity, location, value) VALUES ($1,$2,$3,$4,$5) RETURNING *', [req.user.id, material_id, quantity, location, value || 0]);
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to register waste' });
  }
});

app.get('/api/wastes', authMiddleware, async (req, res) => {
  try {
    const r = await dbQuery('SELECT w.*, m.name AS material_name FROM wastes w LEFT JOIN materials m ON w.material_id = m.id ORDER BY w.created_at DESC');
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch wastes' });
  }
});

// Dashboard stats
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const total = await dbQuery('SELECT COALESCE(SUM(quantity),0) as total FROM wastes');
    const reused = await dbQuery('SELECT COALESCE(SUM(quantity),0) as reused FROM wastes WHERE recovered = true');
    const by_material = await dbQuery('SELECT m.name, COALESCE(SUM(w.quantity),0) as total FROM materials m LEFT JOIN wastes w ON w.material_id = m.id GROUP BY m.name ORDER BY total DESC');
    res.json({ total_kg: Number(total.rows[0].total), reused_kg: Number(reused.rows[0].reused), by_material: by_material.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute dashboard stats' });
  }
});

const distDir = path.join(__dirname, 'dist');
const distIndex = path.join(distDir, 'index.html');
const hasFrontendBuild = fs.existsSync(distIndex);

if (hasFrontendBuild) {
  app.use(express.static(distDir));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(distIndex);
  });
}

// Serve imagens capturadas pela IA
app.use('/uploads', express.static(getUploadsDir()));

// Rotas estendidas — Hardware, IA, Câmeras
const hardwareRoutes = require('./routes/hardwareRoutes')(dbQuery, dbClient, io, authMiddleware);
const aiRoutes       = require('./routes/aiRoutes')(dbQuery, dbClient, io, authMiddleware);
const cameraRoutes   = require('./routes/cameraRoutes')(dbQuery, dbClient, io, authMiddleware);
app.use('/api/hardware', hardwareRoutes);
app.use('/api/ia',       aiRoutes);
app.use('/api/cameras',  cameraRoutes);

// Dashboard IA stats
app.get('/api/dashboard/stats/ia', authMiddleware, async (req, res) => {
  try {
    const total       = await dbQuery('SELECT COUNT(*) as total FROM analises_ia');
    const avgConf     = await dbQuery('SELECT AVG(confianca) as media FROM analises_ia');
    const ultimo      = await dbQuery('SELECT material_detectado, analisado_em FROM analises_ia ORDER BY analisado_em DESC LIMIT 1');
    const porMaterial = await dbQuery('SELECT material_detectado, COUNT(*) as quantidade FROM analises_ia GROUP BY material_detectado ORDER BY quantidade DESC LIMIT 10');
    return res.json({
      total_deteccoes: Number(total.rows[0]?.total || 0),
      confianca_media: parseFloat(Number(avgConf.rows[0]?.media || 0).toFixed(1)),
      ultimo_material: ultimo.rows[0]?.material_detectado || null,
      ultimo_em:       ultimo.rows[0]?.analisado_em || null,
      por_material:    porMaterial.rows,
    });
  } catch (_) {
    return res.json({ total_deteccoes: 0, confianca_media: 0, ultimo_material: null, por_material: [] });
  }
});

// POST /api/residuos — registro principal (registros_residuos + wastes)
app.post('/api/residuos', authMiddleware, async (req, res) => {
  try {
    const { material_id, peso, setor_origem, destino, observacao } = req.body;
    let { analise_ia_id } = req.body;

    if (!material_id) return res.status(400).json({ error: 'material_id é obrigatório' });
    if (!peso || Number(peso) <= 0) return res.status(400).json({ error: 'peso deve ser maior que zero' });

    // Validate material exists (prevents FK violation)
    const matCheck = await dbQuery('SELECT id FROM materials WHERE id = $1', [material_id]);
    if (!matCheck.rows || !matCheck.rows.length) {
      return res.status(400).json({ error: 'Material não encontrado' });
    }

    // Validate analise_ia_id exists — if not, silently drop it to avoid FK violation
    if (analise_ia_id) {
      try {
        const iaCheck = await dbQuery('SELECT id FROM analises_ia WHERE id = $1', [analise_ia_id]);
        if (!iaCheck.rows || !iaCheck.rows.length) analise_ia_id = null;
      } catch (_) {
        analise_ia_id = null;
      }
    }

    const recovered = ['reaproveitamento', 'reciclagem', 'venda'].includes(destino) ? 1 : 0;
    const statusMap = { reaproveitamento: 'reaproveitamento', reciclagem: 'reaproveitamento', venda: 'reaproveitamento', descarte: 'descarte' };
    const rrStatus = statusMap[destino] || 'producao';

    // Helper: insert into registros_residuos with a given usuario_id (null-safe)
    const insertRR = (uid) => dbQuery(
      'INSERT INTO registros_residuos (material_id, usuario_id, analise_ia_id, peso, setor_origem, destino, status, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [material_id, uid, analise_ia_id || null, peso, setor_origem || '', destino || '', rrStatus, observacao || '']
    );

    if (dbClient === 'mysql') {
      let rrInsert;
      try {
        rrInsert = await insertRR(req.user.id);
      } catch (fkErr) {
        // errno 1216/1452 = FK constraint failure on usuario_id (live DB may still FK to usuarios table)
        // Retry with usuario_id = NULL so the record is still saved
        if (fkErr.errno === 1216 || fkErr.errno === 1452) {
          rrInsert = await insertRR(null);
        } else {
          throw fkErr;
        }
      }

      // wastes is a legacy table — failure must not block the main response
      try {
        await dbQuery(
          'INSERT INTO wastes (user_id, material_id, quantity, location, recovered, value) VALUES ($1,$2,$3,$4,$5,$6)',
          [req.user.id, material_id, peso, setor_origem || '', recovered, 0]
        );
      } catch (_) { /* non-critical */ }

      const row = await dbQuery(
        'SELECT rr.*, m.name as material_name, m.category as material_category FROM registros_residuos rr LEFT JOIN materials m ON rr.material_id = m.id WHERE rr.id = $1',
        [rrInsert.raw.insertId]
      );
      return res.json(row.rows[0]);
    }
    const rr = await dbQuery(
      'INSERT INTO registros_residuos (material_id, usuario_id, analise_ia_id, peso, setor_origem, destino, status, observacao) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [material_id, req.user.id, analise_ia_id || null, peso, setor_origem || '', destino || '', rrStatus, observacao || '']
    );
    await dbQuery(
      'INSERT INTO wastes (user_id, material_id, quantity, location, recovered, value) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, material_id, peso, setor_origem || '', recovered, 0]
    );
    res.json(rr.rows[0]);
  } catch (err) {
    console.error('[POST /api/residuos]', err);
    res.status(500).json({ error: 'Falha ao registrar resíduo: ' + err.message });
  }
});

// GET /api/residuos — listagem com joins
app.get('/api/residuos', authMiddleware, async (req, res) => {
  try {
    const r = await dbQuery(
      `SELECT rr.*, m.name as material_name, m.category as material_category, u.name as user_name
       FROM registros_residuos rr
       LEFT JOIN materials m ON rr.material_id = m.id
       LEFT JOIN users u ON rr.usuario_id = u.id
       ORDER BY rr.criado_em DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error('[GET /api/residuos]', err);
    res.status(500).json({ error: 'Falha ao buscar resíduos' });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/reports/export/csv  — filtered residuos as CSV
// GET /api/reports/export/excel — filtered residuos as xlsx
// Query params: startDate (YYYY-MM-DD), endDate, material
// ─────────────────────────────────────────────────────────
function buildResiduosQuery(params) {
  const { startDate, endDate, material } = params;
  let sql = `
    SELECT rr.id,
           COALESCE(m.name,'—')     AS material_name,
           COALESCE(m.category,'—') AS material_category,
           rr.peso,
           COALESCE(rr.setor_origem,'—') AS setor_origem,
           COALESCE(rr.destino,'—')      AS destino,
           COALESCE(rr.status,'—')       AS status,
           CASE WHEN rr.analise_ia_id IS NOT NULL THEN 'Sim' ELSE 'Não' END AS detectado_ia,
           COALESCE(ai.confianca,'')     AS confianca_ia,
           rr.criado_em,
           COALESCE(rr.observacao,'')   AS observacao,
           COALESCE(u.name,'—')          AS usuario
    FROM registros_residuos rr
    LEFT JOIN materials m  ON rr.material_id  = m.id
    LEFT JOIN users u      ON rr.usuario_id   = u.id
    LEFT JOIN analises_ia ai ON rr.analise_ia_id = ai.id
    WHERE 1=1`;
  const values = [];
  if (startDate) { sql += ' AND DATE(rr.criado_em) >= ?'; values.push(startDate); }
  if (endDate)   { sql += ' AND DATE(rr.criado_em) <= ?'; values.push(endDate); }
  if (material)  { sql += ' AND m.name = ?'; values.push(material); }
  sql += ' ORDER BY rr.criado_em DESC';
  return { sql, values };
}

app.get('/api/reports/export/csv', authMiddleware, async (req, res) => {
  try {
    const { sql, values } = buildResiduosQuery(req.query);
    const r = await dbQuery(sql, values);
    const rows = r.rows;

    const HEADER = ['ID','Material','Categoria','Peso (kg)','Setor de Origem','Destino',
                    'Status','Detectado por IA','Confiança IA (%)','Data','Observação','Usuário'];
    const csvRows = rows.map((row) => [
      row.id, row.material_name, row.material_category, row.peso,
      row.setor_origem, row.destino, row.status, row.detectado_ia, row.confianca_ia,
      row.criado_em ? new Date(row.criado_em).toLocaleDateString('pt-BR') : '',
      row.observacao, row.usuario,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'));

    const csv = '\uFEFF' + [HEADER.join(';'), ...csvRows].join('\r\n');
    const filename = `ecoengineers-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv;charset=utf-8;');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('[GET /api/reports/export/csv]', err.message);
    res.status(500).json({ error: 'Falha ao exportar CSV' });
  }
});

app.get('/api/reports/export/excel', authMiddleware, async (req, res) => {
  let ExcelJS;
  try { ExcelJS = require('exceljs'); } catch {
    return res.status(503).json({ error: 'Execute: npm install exceljs' });
  }
  try {
    const { sql, values } = buildResiduosQuery(req.query);
    const r = await dbQuery(sql, values);
    const rows = r.rows;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'EcoEngineers';
    const ws = wb.addWorksheet('Resíduos', { views: [{ state: 'frozen', ySplit: 1 }] });

    ws.columns = [
      { header: 'ID',              key: 'id',          width: 8  },
      { header: 'Material',        key: 'mat',         width: 22 },
      { header: 'Categoria',       key: 'cat',         width: 20 },
      { header: 'Peso (kg)',       key: 'peso',        width: 12 },
      { header: 'Setor de Origem', key: 'setor',       width: 20 },
      { header: 'Destino',         key: 'destino',     width: 22 },
      { header: 'Status',          key: 'status',      width: 18 },
      { header: 'Detectado por IA',key: 'ia',          width: 16 },
      { header: 'Confiança IA (%)',key: 'conf',        width: 16 },
      { header: 'Data',            key: 'data',        width: 14 },
      { header: 'Observação',      key: 'obs',         width: 30 },
      { header: 'Usuário',         key: 'usuario',     width: 20 },
    ];

    // Style header row
    ws.getRow(1).eachCell((cell) => {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
      cell.font   = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    ws.getRow(1).height = 22;

    rows.forEach((row, idx) => {
      ws.addRow({
        id:      row.id,
        mat:     row.material_name,
        cat:     row.material_category,
        peso:    parseFloat(row.peso) || 0,
        setor:   row.setor_origem,
        destino: row.destino,
        status:  row.status,
        ia:      row.detectado_ia,
        conf:    row.confianca_ia !== '' ? parseFloat(row.confianca_ia) : '',
        data:    row.criado_em ? new Date(row.criado_em).toLocaleDateString('pt-BR') : '',
        obs:     row.observacao,
        usuario: row.usuario,
      });
      if (idx % 2 === 1) {
        ws.getRow(idx + 2).eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
        });
      }
    });

    const filename = `ecoengineers-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    // Note: wb.xlsx.write() ends the stream internally — do NOT call res.end() again
  } catch (err) {
    console.error('[GET /api/reports/export/excel]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Falha ao gerar Excel' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const port = process.env.PORT || 4000;
async function start() {
  try {
    await dbQuery('SELECT 1');
    httpServer.listen(port, () => console.log(`[EcoEngineers] Server running on :${port} | db=${dbClient} schema=${dbSchema} | Socket.IO enabled`));
  } catch (err) {
    console.error('Failed to connect to database on startup:', err.message);
    process.exit(1);
  }
}

start();
