#!/usr/bin/env bash
# Sobe o stack com docker-compose.host.yml no Linux (backend em network_mode host → OpenProject em localhost no host).
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
  echo ""
fi

# Em Linux: docker-compose.host.yml (network_mode host) para OpenProject em localhost no host.
COMPOSE_FILES=(-f docker-compose.yml)
if [[ "$(uname -s)" == "Linux" ]]; then
  COMPOSE_FILES+=(-f docker-compose.host.yml)
  echo "Modo host (Linux): compose inclui docker-compose.host.yml (backend em network_mode host)."
else
  echo "Aviso: não é Linux — só docker-compose.yml. O override host não se aplica como no Linux."
fi

echo ""
echo "URLs:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:3001 (no host, com override host)"
echo "  Health:    http://localhost:3001/health"
echo "  Postgres:  localhost:5433"
echo ""
echo "Dica: em segundo plano use: $0 -d"
echo ""

"${COMPOSE[@]}" "${COMPOSE_FILES[@]}" up --build "$@"
