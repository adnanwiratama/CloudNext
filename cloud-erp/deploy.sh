#!/bin/bash
# ── CloudNext production deploy ──────────────────────────────────────────────
# Run this ON THE SERVER from the project root (where docker-compose.yml lives).
# It builds images, runs DB migrations + seed (first time), and starts the stack.
#
#   Usage:  ./deploy.sh            (build + migrate + up)
#           ./deploy.sh --no-seed  (skip seeding; use for redeploys)
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "❌ .env not found. Create it first:"
  echo "   echo \"DB_PASSWORD=\$(openssl rand -base64 32 | tr -d '/+=')\"  > .env"
  echo "   echo \"JWT_SECRET=\$(openssl rand -base64 48 | tr -d '/+=')\"   >> .env"
  echo "   echo \"PUBLIC_ORIGIN=https://www.cloudnext.cloudplus.co.id\"    >> .env"
  exit 1
fi

echo "🔨 Building images..."
docker compose build

echo "🗄️  Starting database + redis..."
docker compose up -d postgres redis
echo "⏳ Waiting for database..."
sleep 10

echo "📊 Running migrations + seed..."
docker compose --profile migrate run --rm migrate

echo "🚀 Starting backend + frontend..."
docker compose up -d backend frontend

echo ""
echo "✅ Done. Containers:"
docker compose ps
echo ""
echo "   Local test:  curl -I http://127.0.0.1:8080"
echo "   Then point aaPanel reverse proxy for www.cloudnext.cloudplus.co.id → http://127.0.0.1:8080"
