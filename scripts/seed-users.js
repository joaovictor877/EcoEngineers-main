#!/usr/bin/env node
/**
 * EcoEngineers — seed-users.js
 * Insere (ou atualiza) os 3 usuários padrão do sistema com senhas bcrypt.
 *
 * Usage:
 *   node scripts/seed-users.js
 *
 * Requer .env com DATABASE_URL configurado.
 */

'use strict';

const bcrypt = require('bcrypt');
const mysql  = require('mysql2/promise');
require('dotenv').config();

const USERS = [
  {
    name:  'Administrador',
    email: 'admin@ecoengineers.com',
    password: '123456',
    role:  'admin',
    cargo: 'Administrador',
    setor: 'TI',
  },
  {
    name:  'Operador ESG',
    email: 'operador@ecoengineers.com',
    password: '123456',
    role:  'operador',
    cargo: 'Operador ESG',
    setor: 'Produção',
  },
  {
    name:  'Gestor Ambiental',
    email: 'gestor@ecoengineers.com',
    password: '123456',
    role:  'gestor',
    cargo: 'Gestor ESG',
    setor: 'Gestão',
  },
];

async function main() {
  let connConfig;
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    connConfig = {
      host:     u.hostname,
      port:     parseInt(u.port || '3306'),
      user:     decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    };
  } else {
    connConfig = {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '3306'),
      user:     process.env.DB_USER     || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME     || 'ecoengineers',
    };
  }

  const conn = await mysql.createConnection(connConfig);

  // Ensure cargo/setor columns exist (MySQL-compatible check)
  async function addCol(col, def) {
    const [rows] = await conn.execute(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = ?`,
      [col]
    );
    if (rows.length === 0) {
      await conn.execute(`ALTER TABLE users ADD COLUMN \`${col}\` ${def}`);
      console.log(`  + Coluna "${col}" adicionada à tabela users.`);
    }
  }
  await addCol('cargo', 'VARCHAR(100) NULL');
  await addCol('setor', 'VARCHAR(100) NULL');

  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [u.email]);

    if (rows.length > 0) {
      await conn.execute(
        'UPDATE users SET name = ?, password_hash = ?, role = ?, cargo = ?, setor = ? WHERE email = ?',
        [u.name, hash, u.role, u.cargo, u.setor, u.email]
      );
      console.log(`✅  Atualizado: ${u.email} (${u.role})`);
    } else {
      const [res] = await conn.execute(
        'INSERT INTO users (name, email, password_hash, role, cargo, setor) VALUES (?, ?, ?, ?, ?, ?)',
        [u.name, u.email, hash, u.role, u.cargo, u.setor]
      );
      console.log(`✅  Criado: ${u.email} (${u.role}, id: ${res.insertId})`);
    }
  }

  await conn.end();
  console.log('\n🎉  Seed concluído! 3 usuários configurados.');
  console.log('     admin@ecoengineers.com     / 123456');
  console.log('     operador@ecoengineers.com  / 123456');
  console.log('     gestor@ecoengineers.com    / 123456');
}

main().catch((err) => {
  console.error('❌  Erro:', err.message);
  process.exit(1);
});
