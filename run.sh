#!/usr/bin/env bash
# Sobe PostgreSQL, backend e frontend via Docker Compose (execução local).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Erro: Docker não está instalado ou não está no PATH." >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Erro: docker compose (plugin) ou docker-compose não encontrado." >&2
  exit 1
fi

if [[ ! -f .env ]] && [[ -f .env.example ]]; then
  echo "Aviso: arquivo .env não encontrado. Copie e edite: cp .env.example .env"
  echo "       (OPENPROJECT_API_KEY e URL são necessários para importar no OpenProject real.)"
  echo ""
fi

echo "Subindo db, backend e frontend..."
echo ""
echo "URLs:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:3001"
echo "  Health:    http://localhost:3001/health"
echo "  Postgres:  localhost:5433 (usuário importer, DB importer)"
echo ""
echo "Dica: em segundo plano use: $0 -d"
echo ""

"${COMPOSE[@]}" up --build "$@"
