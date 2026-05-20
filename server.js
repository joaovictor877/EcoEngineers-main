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

app.get('/', (req, res) => {
  res.redirect('/app');
});

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
      return res.status(400).json({ error: 'email and password are required' });
    }
    const r = await dbQuery('SELECT * FROM users WHERE email = $1', [email]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
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

  app.get('/app', (req, res) => {
    res.sendFile(distIndex);
  });

  app.get('/app/*', (req, res) => {
    res.sendFile(distIndex);
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(distIndex);
  });
}

// Serve imagens capturadas pela IA
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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