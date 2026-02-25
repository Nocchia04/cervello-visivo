#!/usr/bin/env bash
# setup.sh — Primo avvio: genera .env con JWT_SECRET casuale
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

if [ -f "$ENV_FILE" ]; then
  echo "⚠️  .env già esistente. Nessuna modifica."
  exit 0
fi

echo "📋 Copio .env.example → .env ..."
cp "$ENV_EXAMPLE" "$ENV_FILE"

# Genera JWT_SECRET sicuro (32 byte = 256 bit in base64)
if command -v openssl &>/dev/null; then
  JWT_SECRET=$(openssl rand -base64 32)
elif command -v node &>/dev/null; then
  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
else
  echo "❌ Impossibile generare JWT_SECRET: installa openssl o node."
  exit 1
fi

# Sostituisce il placeholder nel .env
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=\"$JWT_SECRET\"|" "$ENV_FILE"
else
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=\"$JWT_SECRET\"|" "$ENV_FILE"
fi

echo "✅ .env creato con JWT_SECRET sicuro."
echo "🐳 Avvia il database con: docker compose up -d"
echo "🗄️  Poi esegui le migrazioni: npm run db:migrate"
