'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Ordem fixa: schema base primeiro, depois as migrations numeradas em ordem.
function listMigrationFiles() {
  const initFile = { id: 'init.sql', fullPath: path.join(__dirname, '..', 'db', 'init.sql') };
  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    : [];
  const migrations = files.map((f) => ({ id: f, fullPath: path.join(migrationsDir, f) }));
  return [initFile, ...migrations].filter((f) => fs.existsSync(f.fullPath));
}

/**
 * Aplica automaticamente, na ordem correta, o db/init.sql e todas as
 * migrations em database/migrations/*.sql que ainda não foram executadas
 * neste banco. Registra o que já rodou em schema_migrations, então é
 * seguro chamar isso toda vez que o servidor iniciar (cada deploy).
 *
 * Só roda para MySQL — todos os scripts atuais usam sintaxe MySQL
 * (ENGINE=InnoDB, ENUM, AUTO_INCREMENT, PREPARE/EXECUTE).
 */
async function runMigrations(dbClient, databaseUrl, dbSsl) {
  if (dbClient !== 'mysql') {
    console.log('[Migrations] dbClient != mysql — pulando (scripts atuais são MySQL-only).');
    return;
  }

  const files = listMigrationFiles();
  if (files.length === 0) {
    console.log('[Migrations] Nenhum arquivo .sql encontrado.');
    return;
  }

  // Conexão dedicada (não o pool compartilhado) com multipleStatements
  // habilitado — necessário pois alguns scripts usam SET @var / PREPARE /
  // EXECUTE, que precisam rodar na mesma sessão/conexão.
  const connection = await mysql.createConnection({
    uri: databaseUrl,
    ssl: dbSsl ? {} : undefined,
    multipleStatements: true,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(191) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [rows] = await connection.query('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));

    for (const file of files) {
      if (applied.has(file.id)) continue;

      console.log(`[Migrations] Aplicando ${file.id}...`);
      const sql = fs.readFileSync(file.fullPath, 'utf8');
      try {
        await connection.query(sql);
        await connection.query('INSERT INTO schema_migrations (id) VALUES (?)', [file.id]);
        console.log(`[Migrations] OK: ${file.id}`);
      } catch (err) {
        // Não derruba o servidor por causa de uma migration — loga bem
        // visível e segue para a próxima, já que os scripts são
        // idempotentes (IF NOT EXISTS / WHERE NOT EXISTS) na maior parte.
        console.error(`[Migrations] FALHOU: ${file.id} —`, err.message);
      }
    }
  } finally {
    await connection.end();
  }
}

module.exports = { runMigrations };
