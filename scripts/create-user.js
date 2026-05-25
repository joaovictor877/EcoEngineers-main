#!/usr/bin/env node
/**
 * EcoEngineers — create-user.js
 * Creates or updates a user in the MySQL database with a bcrypt-hashed password.
 *
 * Usage:
 *   node scripts/create-user.js <email> <password> [role]
 *
 * Examples:
 *   node scripts/create-user.js admin@eco.com MinhaS3nha! admin
 *   node scripts/create-user.js joao@eco.com Eco@2026! user
 *
 * Roles: admin | user (default: user)
 */

'use strict';

const bcrypt = require('bcrypt');
const mysql  = require('mysql2/promise');
require('dotenv').config();

const [, , email, password, role = 'user'] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/create-user.js <email> <password> [role]');
  process.exit(1);
}

const VALID_ROLES = ['admin', 'user'];
if (!VALID_ROLES.includes(role)) {
  console.error(`Invalid role "${role}". Use: ${VALID_ROLES.join(' | ')}`);
  process.exit(1);
}

// Basic email sanity check
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`Invalid email: "${email}"`);
  process.exit(1);
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

async function main() {
  // Support both DATABASE_URL and individual DB_* vars
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

  try {
    const hash = await bcrypt.hash(password, 12);

    // Check if user already exists
    const [rows] = await conn.execute('SELECT id, email, role FROM users WHERE email = ?', [email]);

    if (rows.length > 0) {
      // Update existing user
      await conn.execute(
        'UPDATE users SET password_hash = ?, role = ? WHERE email = ?',
        [hash, role, email]
      );
      console.log(`✅  Updated user: ${email} (role: ${role}, id: ${rows[0].id})`);
    } else {
      // Insert new user
      const [result] = await conn.execute(
        'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)',
        [email, hash, role, email.split('@')[0]]
      );
      console.log(`✅  Created user: ${email} (role: ${role}, id: ${result.insertId})`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
