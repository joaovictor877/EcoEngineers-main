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
 * Divide um script SQL em comandos, respeitando aspas e comentários
 * (um ";" dentro de uma string não encerra o comando).
 */
function splitStatements(sql) {
  const out = [];
  let atual = '';
  let aspas = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const prox = sql[i + 1];
    if (aspas) {
      atual += c;
      if (c === '\\') { atual += prox || ''; i++; continue; }
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === '-' && prox === '-') {          // comentário de linha
      while (i < sql.length && sql[i] !== '\n') i++;
      atual += '\n';
      continue;
    }
    if (c === '#') {
      while (i < sql.length && sql[i] !== '\n') i++;
      atual += '\n';
      continue;
    }
    if (c === '/' && prox === '*') {          // comentário de bloco
      const fim = sql.indexOf('*/', i + 2);
      i = fim === -1 ? sql.length : fim + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') aspas = c;
    if (c === ';') {
      if (atual.trim()) out.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
}

/** Divide por vírgulas que não estão dentro de parênteses nem de aspas. */
function splitTopLevel(texto) {
  const partes = [];
  let atual = '';
  let nivel = 0;
  let aspas = null;
  for (const c of texto) {
    if (aspas) {
      atual += c;
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') aspas = c;
    else if (c === '(') nivel++;
    else if (c === ')') nivel--;
    if (c === ',' && nivel === 0) {
      partes.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

// Erros que significam "já está feito" — seguros de ignorar em reexecução.
const JA_EXISTE = new Set([
  1050, // tabela já existe
  1060, // coluna duplicada
  1061, // índice duplicado
  1062, // registro duplicado
  1091, // não dá para remover (já não existe)
  1826, // chave estrangeira duplicada
]);

// Erros de chave estrangeira: tipo diferente da tabela referenciada (comum
// quando as tabelas base foram criadas pelo professor com BIGINT UNSIGNED).
const ERRO_FK = new Set([150, 1005, 1215, 1216, 1217, 1822, 1824, 3734, 3780]);

function removerChavesEstrangeiras(createSql) {
  const abre = createSql.indexOf('(');
  const fecha = createSql.lastIndexOf(')');
  if (abre === -1 || fecha === -1) return createSql;
  const itens = splitTopLevel(createSql.slice(abre + 1, fecha))
    .filter((item) => !/FOREIGN\s+KEY/i.test(item));
  return `${createSql.slice(0, abre + 1)}\n  ${itens.join(',\n  ')}\n${createSql.slice(fecha)}`;
}

async function colunaExiste(connection, tabela, coluna) {
  const [rows] = await connection.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [tabela, coluna]
  );
  return rows.length > 0;
}

/**
 * Executa um comando. Retorna null se deu certo (ou já estava aplicado),
 * ou a mensagem de erro se falhou de verdade.
 */
async function executar(connection, sql, avisos) {
  // MySQL 8 não aceita "ADD COLUMN IF NOT EXISTS" (só o MariaDB). Quebra o
  // ALTER em partes e confere cada coluna no information_schema.
  const alter = sql.match(/^ALTER\s+TABLE\s+`?(\w+)`?\s+([\s\S]+)$/i);
  if (alter && /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i.test(alter[2])) {
    const tabela = alter[1];
    for (const clausula of splitTopLevel(alter[2])) {
      const add = clausula.match(/^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?\s+([\s\S]+)$/i);
      if (add) {
        if (await colunaExiste(connection, tabela, add[1])) continue;
        const erro = await executar(connection, `ALTER TABLE \`${tabela}\` ADD COLUMN \`${add[1]}\` ${add[2]}`, avisos);
        if (erro) return erro;
      } else {
        const erro = await executar(connection, `ALTER TABLE \`${tabela}\` ${clausula}`, avisos);
        if (erro) return erro;
      }
    }
    return null;
  }

  try {
    await connection.query(sql);
    return null;
  } catch (err) {
    if (JA_EXISTE.has(err.errno)) return null;

    if (ERRO_FK.has(err.errno) || /foreign key/i.test(err.message)) {
      // CREATE TABLE com FK incompatível: cria sem as FKs (o app não depende delas).
      if (/^CREATE\s+TABLE/i.test(sql)) {
        try {
          await connection.query(removerChavesEstrangeiras(sql));
          avisos.push(`tabela criada sem chaves estrangeiras (${err.message})`);
          return null;
        } catch (err2) {
          if (JA_EXISTE.has(err2.errno)) return null;
          return err2.message;
        }
      }
      avisos.push(`chave estrangeira ignorada (${err.message})`);
      return null;
    }
    return err.message;
  }
}

/**
 * Aplica automaticamente, na ordem correta, o db/init.sql e todas as
 * migrations em database/migrations/*.sql que ainda não foram executadas
 * neste banco. Registra o que já rodou em schema_migrations, então é
 * seguro chamar isso toda vez que o servidor iniciar (cada deploy).
 *
 * Executa comando por comando: um erro não impede os comandos seguintes,
 * e a migration só é marcada como aplicada se nenhum comando falhou de
 * verdade (aí ela é tentada de novo no próximo start).
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

  // Conexão dedicada: SET @var / PREPARE / EXECUTE precisam da mesma sessão.
  const connection = await mysql.createConnection({
    uri: databaseUrl,
    ssl: dbSsl ? {} : undefined,
    connectTimeout: 20000,
  });

  try {
    const [[versao]] = await connection.query('SELECT VERSION() AS v');
    console.log(`[Migrations] Banco: ${versao.v}`);

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
      const comandos = splitStatements(fs.readFileSync(file.fullPath, 'utf8'));
      const falhas = [];
      const avisos = [];

      for (const sql of comandos) {
        const erro = await executar(connection, sql, avisos);
        if (erro) falhas.push(`${erro}\n      em: ${sql.replace(/\s+/g, ' ').slice(0, 160)}`);
      }

      avisos.forEach((a) => console.warn(`[Migrations] Aviso em ${file.id}: ${a}`));
      if (falhas.length === 0) {
        await connection.query('INSERT INTO schema_migrations (id) VALUES (?)', [file.id]);
        console.log(`[Migrations] OK: ${file.id}`);
      } else {
        // Não derruba o servidor: loga bem visível e tenta de novo no próximo start.
        console.error(`[Migrations] FALHOU: ${file.id} — ${falhas.length} comando(s):`);
        falhas.forEach((f) => console.error(`    - ${f}`));
      }
    }
  } finally {
    await connection.end();
  }
}

module.exports = { runMigrations, splitStatements, splitTopLevel, removerChavesEstrangeiras };
