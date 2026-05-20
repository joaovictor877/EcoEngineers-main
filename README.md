Projeto backend do EcoEngineers (Node.js + Express + PostgreSQL/MySQL)

Instruções rápidas:

1. Copie .env.example para .env e adapte DATABASE_URL e JWT_SECRET.
	Opcional: defina DB_SCHEMA quando as tabelas do professor estiverem em outro schema.
	Opcional: defina DB_SSL=true quando o banco exigir SSL.
2. Instale dependências: npm install
3. Crie o banco de dados PostgreSQL e rode o script db/init.sql (psql -f db/init.sql)
4. Rode em dev: npm run dev

Endpoints principais:
- POST /api/register
- POST /api/login
- GET /api/materials
- POST /api/materials
- POST /api/wastes
- GET /api/wastes
- GET /api/dashboard/stats

Token JWT deve ser enviado em Authorization: Bearer <token>

Variáveis de ambiente atuais:

- DB_CLIENT=mysql (ou postgres)
- DATABASE_URL=mysql://user:pass@host:3306/dbname
- JWT_SECRET=chave-secreta-forte
- DB_SCHEMA=public
- DB_SSL=false

Quer publicar no Git?

Use os scripts em scripts/ para inicializar, commitar e fazer push (mensagens em português):

PowerShell (Windows):

powershell -ExecutionPolicy Bypass -File scripts/git-publish.ps1

Bash (Linux/macOS/Git Bash):

bash scripts/git-publish.sh

Observação: os scripts esperam que o remote já esteja configurado (git remote add origin <url>) — caso não esteja, adiciona manualmente e rode novamente.
