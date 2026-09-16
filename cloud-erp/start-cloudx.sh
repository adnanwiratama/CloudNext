#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════╗"
echo "║       🚀 Starting NetCloudX/CloudERP           ║"
echo "╚════════════════════════════════════════════════╝"

cd "$(dirname "$0")"

# Check if any CloudERP containers are running
if docker ps | grep -q "cloud-erp"; then
  echo ""
  echo "⚠️  CloudERP containers already running!"
  echo ""
  docker ps --filter "name=cloud-erp" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  echo "💡 Run ./stop-cloudx.sh first to restart"
  exit 0
fi

# Start PostgreSQL
echo ""
echo "🗄️  Starting PostgreSQL database..."
docker-compose -f docker-compose.dev.yml up -d postgres

# Wait for PostgreSQL
echo "⏳ Waiting for database to be ready..."
sleep 8

# Run migrations and seeds
echo "📊 Running migrations and seeding data..."
docker-compose -f docker-compose.dev.yml run --rm migrate

# Start backend
echo ""
echo "🔌 Starting Backend API (port 4100)..."
docker-compose -f docker-compose.dev.yml up -d backend

# Wait for backend
echo "⏳ Waiting for backend to start..."
sleep 5

# Start frontend
echo "🎨 Starting Frontend UI (port 5173)..."
docker-compose -f docker-compose.dev.yml up -d frontend

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║       ✅ NetCloudX/CloudERP is READY!          ║"
echo "╚════════════════════════════════════════════════╝"
echo ""
echo "   🌐 Open Browser: http://localhost:5173"
echo ""
echo "   👤 Login Credentials:"
echo "      Email:    admin@cloudmfg.co.id"
echo "      Password: CloudERP@2026"
echo "      Company:  CMI"
echo ""
echo "   📋 View logs:    ./logs-cloudx.sh"
echo "   🔄 Restart:      ./stop-cloudx.sh && ./start-cloudx.sh"
echo "   🛑 Stop:         ./stop-cloudx.sh"
echo ""
