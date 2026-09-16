#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════╗"
echo "║       CloudERP Development Setup               ║"
echo "╚════════════════════════════════════════════════╝"

# Check PostgreSQL is running
if ! pg_isready -h localhost -p 5432 -q 2>/dev/null; then
  echo "⚠  PostgreSQL not found on port 5432."
  echo "   Starting via Docker..."
  docker run -d --name cloud-erp-pg \
    -e POSTGRES_DB=cloud_erp \
    -e POSTGRES_USER=erp_user \
    -e POSTGRES_PASSWORD=erp_secure_password \
    -p 5432:5432 \
    postgres:15-alpine 2>/dev/null || echo "   (container may already exist)"
  sleep 3
fi

# Install backend
echo ""
echo "📦 Installing backend dependencies..."
cd "$(dirname "$0")/../backend"
npm install

# Run migrations
echo ""
echo "🗄  Running database migrations..."
npx knex --knexfile src/config/knexfile.ts migrate:latest || true

# Run seeds
echo ""
echo "🌱 Seeding demo data..."
npx knex --knexfile src/config/knexfile.ts seed:run || true

# Install frontend
echo ""
echo "📦 Installing frontend dependencies..."
cd "../frontend"
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "   To start development servers:"
echo "   Backend:  cd backend && npm run dev   (port 4000)"
echo "   Frontend: cd frontend && npm run dev  (port 5173)"
echo ""
echo "   Login: admin@cloudmfg.co.id / CloudERP@2026"
