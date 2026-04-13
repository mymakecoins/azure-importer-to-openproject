# openproject-importer

Importador de backlog **Azure DevOps (CSV)** → **OpenProject** (API v3), com API Node.js (Express), interface React + Tailwind (Vite), PostgreSQL e Docker Compose.

Documentação de planejamento e requisitos: pasta [`_docs/`](./_docs/) (por exemplo [`prompt1.md`](./_docs/prompt1.md) e os artefatos `ers-plano-*.md`).

## Segurança

- **Não commite** `.env` nem cole chaves de API em arquivos versionados.
- Se uma chave vazou em prompt, log ou commit, **rotacione-a** no OpenProject.
- Use [`.env.example`](./.env.example) só como referência de nomes e valores de exemplo.

## Pré-requisitos

- Docker e Docker Compose (plugin `docker compose` ou `docker-compose`)
- Uma instância OpenProject acessível a partir dos containers (referência comum: porta **8080** no host)

## Configuração

1. Na raiz do projeto: `cp .env.example .env`
2. Preencha `OPENPROJECT_API_KEY` e ajuste `OPENPROJECT_BASE_URL`.
3. Ajuste `OPENPROJECT_PROJECT_IDENTIFIER`, `OPENPROJECT_DEFAULT_TYPE_ID` e, se precisar, `OPENPROJECT_TYPE_MAP_JSON` conforme os **IDs numéricos** de tipos no seu OpenProject.
4. Ajuste `CSV_COLUMN_*` se os cabeçalhos do CSV forem diferentes dos padrões Azure DevOps.

Detalhes (Linux, `host.docker.internal`, bind do OpenProject em `0.0.0.0`, modo host): comentários em [`.env.example`](./.env.example).

### Modo dry-run

Com `DRY_RUN=true`, o backend valida o CSV e simula a importação **sem** criar work packages na API — útil para testes de fumaça.

## Subir a stack (Docker)

Na raiz:

```bash
./run.sh
```

Equivalente:

```bash
docker compose up --build
```

- **UI:** http://localhost:3000  
- **API:** http://localhost:3001  
- **Health:** http://localhost:3001/health  
- **PostgreSQL (host):** `localhost:5433` → container `5432` (usuário `importer`, banco `importer`)

Segundo plano: `./run.sh -d` ou `docker compose up --build -d`.

### Linux e OpenProject só em `127.0.0.1`

Se o OpenProject no host escuta apenas em loopback e o backend em container não alcança via `host.docker.internal`, use o override de rede do host:

```bash
docker compose -f docker-compose.yml -f docker-compose.host.yml up --build
```

Ou o atalho que inclui esse override no Linux:

```bash
./run-debug.sh
```

Nesse modo, prefira `OPENPROJECT_BASE_URL=http://localhost:8080` no `.env` (conforme comentários no `.env.example`). O override não se aplica da mesma forma no Docker Desktop para Mac/Windows.

## CSV esperado (padrão)

Colunas configuráveis por variáveis `CSV_COLUMN_*`; padrão alinhado a export comum do Azure DevOps:

- **ID** — identificador da linha no export  
- **Title** — vira `subject` do work package  
- **Work Item Type** — mapeado para tipo numérico via `OPENPROJECT_TYPE_MAP_JSON` ou `OPENPROJECT_DEFAULT_TYPE_ID`  
- **Parent** — ID do pai (vazio para raiz)

Export hierárquico com `Title 1`, `Title 2`, … e sem coluna **Parent**: título e pai podem ser derivados pela ordem das linhas e pela profundidade (ver comentários em `.env.example`).

A validação exige hierarquia acíclica e pai existente.

## API REST (resumo)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/health` | Saúde do serviço |
| `POST` | `/api/imports` | Upload CSV (`multipart`, campo `file`) |
| `POST` | `/api/imports/:id/start` | Inicia processamento |
| `POST` | `/api/imports/:id/cancel` | Solicita cancelamento |
| `POST` | `/api/imports/:id/retry` | Prepara nova tentativa após falha |
| `GET` | `/api/imports` | Lista importações (`limit`, `offset`) |
| `GET` | `/api/imports/:id` | Detalhe de uma importação |

## Desenvolvimento local (sem Docker)

**Backend** — suba o Postgres (por exemplo só o serviço `db` do Compose) e aponte `DATABASE_URL`:

```bash
cd backend
npm install
export DATABASE_URL=postgres://importer:importer@localhost:5433/importer
# Opcional: variáveis OpenProject e demais — use .env na raiz do repositório (o backend carrega ../../.env)
npm start
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

O Vite faz proxy de `/api` para `http://localhost:3001`.

## Testes (backend)

```bash
cd backend
npm test
```

## Estrutura do repositório

```
openproject-importer/
├── _docs/                    # Planejamento, prompts e ERS
├── backend/                  # Node.js (Express, pg, csv-parse, multer)
├── frontend/                 # Vite + React + Tailwind + nginx (imagem Docker)
├── docker-compose.yml
├── docker-compose.host.yml   # Override Linux (backend em host network)
├── run.sh                    # Sobe stack padrão
├── run-debug.sh              # Linux: inclui override host
└── .env.example
```

## Limitações da v1

- Relações entre itens além de pai/filho ficam para evolução, conforme o formato do CSV.
- Autenticação OpenProject: padrão **HTTP Basic** (`apikey` + chave); `OPENPROJECT_AUTH_MODE=bearer` quando aplicável à sua instância.
