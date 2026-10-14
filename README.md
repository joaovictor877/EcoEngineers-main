Projeto backend do EcoEngineers (Node.js + Express + PostgreSQL/MySQL)

## Posto de Validação de Expedição

O sistema evoluiu do registro de resíduos para um **posto de validação**: antes de um item
ser expedido, a câmera fotografa o item, a balança confirma o peso e o QR Code da etiqueta é
lido a partir da mesma imagem — os três sinais são cruzados contra o produto esperado e o
item é aprovado ou reprovado automaticamente. O fluxo antigo de registro/triagem de resíduos
continua funcionando normalmente ao lado do novo fluxo.

Instruções rápidas:

1. Copie .env.example para .env e adapte DATABASE_URL e JWT_SECRET.
	Opcional: defina DB_SCHEMA quando as tabelas do professor estiverem em outro schema.
	Opcional: defina DB_SSL=true quando o banco exigir SSL.
2. Instale dependências: npm install
3. Crie o banco de dados e rode os scripts em `database/migrations/` na ordem (001, 002, 003)
	após o `db/init.sql` inicial.
4. Rode em dev: npm run dev

Endpoints principais:
- POST /api/register
- POST /api/login
- GET /api/materials
- POST /api/materials
- POST /api/wastes
- GET /api/wastes
- GET /api/dashboard/stats

Posto de validação (novo):
- POST /api/validacoes — captura/recebe imagem + peso, lê o QR e decide aprovado/reprovado
- GET /api/validacoes — histórico de validações
- GET /api/validacoes/stats — KPIs (taxa de aprovação, reprovações)
- GET /api/validacoes/postos — postos de validação cadastrados
- GET/POST/PUT/DELETE /api/produtos — catálogo de produtos esperados
- GET/POST/DELETE /api/etiquetas — etiquetas com QR Code (POST gera o QR automaticamente)
- POST/PUT/DELETE /api/validacoes/postos — postos por linha (linha + código = tópico MQTT)
- GET /api/validacoes/caixa/:codigo — situação da caixa no despacho (liberada / retida)
- GET/POST /api/validacoes/calibracoes — calibração da balança contra massa padrão
- GET /api/push/chave-publica, POST /api/push/inscrever — alerta Web Push no celular do gestor

Critérios (imagem + peso + QR Code): reprova se o QR não tem etiqueta, se o peso sai da
tolerância do produto ou se a imagem não confere com o produto (com `OPENAI_API_KEY`).
Caixa reprovada fica **retida** e só é liberada por uma nova validação aprovada.

MQTT: broker embutido no servidor (TCP 1883 e `wss://<servidor>/mqtt`). O ESP32 do posto
publica pelo Wi-Fi em `<linha>/<posto>/validacao`; o servidor responde em `<linha>/<posto>/resultado` e
`alertas/<linha>/<posto>`. Ver `hardware/README.md` e o app Android em `android/`.

Token JWT deve ser enviado em Authorization: Bearer <token>

Variáveis de ambiente atuais:

- DB_CLIENT=mysql (ou postgres)
- DATABASE_URL=mysql://user:pass@host:3306/dbname
- JWT_SECRET=chave-secreta-forte
- DB_SCHEMA=public
- DB_SSL=false
- MQTT_BROKER_URL (opcional) — broker externo; sem ela o servidor sobe o broker embutido
- MQTT_EMBEDDED=false (opcional) — desliga o broker embutido
- MQTT_PORT (opcional, padrão 1883) — porta TCP do broker embutido
- HARDWARE_API_KEY — senha do posto no broker e nas rotas de hardware
- OPENAI_API_KEY (opcional) — ativa a verificação da imagem contra o produto
- IMAGEM_CONFIANCA_MIN (padrão 60) — confiança mínima para a imagem reprovar
- CALIBRACAO_VALIDADE_DIAS (padrão 7), CALIBRACAO_ERRO_MAX_PERCENT (padrão 1),
  CALIBRACAO_OBRIGATORIA=true (reprova caixa pesada com balança sem calibração válida)
- VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (opcionais) — sem elas, são geradas e guardadas no banco

Quer publicar no Git?

Use os scripts em scripts/ para inicializar, commitar e fazer push (mensagens em português):

PowerShell (Windows):

powershell -ExecutionPolicy Bypass -File scripts/git-publish.ps1

Bash (Linux/macOS/Git Bash):

bash scripts/git-publish.sh

Observação: os scripts esperam que o remote já esteja configurado (git remote add origin <url>) — caso não esteja, adiciona manualmente e rode novamente.
