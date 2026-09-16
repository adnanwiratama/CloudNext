#!/bin/bash
set -e

echo "🔧 Setting up NetCloudX/CloudERP scripts..."

# 1. Update docker-compose.dev.yml
cat > docker-compose.dev.yml << 'EOF'
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    container_name: cloud-erp-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: cloud_erp
      POSTGRES_USER: erp_user
      POSTGRES_PASSWORD: erp_secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U erp_user -d cloud_erp"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    image: node:20-alpine
    container_name: cloud-erp-backend
    working_dir: /app
    restart: unless-stopped
    environment:
      NODE_ENV: development
      APP_PORT: 4100
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: cloud_erp
      DB_USER: erp_user
      DB_PASSWORD: erp_secure_password
      JWT_SECRET: cloud-erp-super-secret-jwt-key-2026-change-in-production
      JWT_EXPIRES_IN: 8h
      CORS_ORIGINS: http://localhost:5173,http://localhost:4173
      LOG_LEVEL: info
    ports:
      - "4100:4100"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - backend_node_modules:/app/node_modules
    command: sh -c "npm install && npx ts-node-dev --respawn --transpile-only src/index.ts"

  migrate:
    image: node:20-alpine
    container_name: cloud-erp-migrate
    working_dir: /app
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: cloud_erp
      DB_USER: erp_user
      DB_PASSWORD: erp_secure_password
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - backend_node_modules:/app/node_modules
    command: sh -c "npm install && npx knex --knexfile src/config/knexfile.ts migrate:latest && npx knex --knexfile src/config/knexfile.ts seed:run && echo 'Migration and seed complete'"
    profiles:
      - migrate

  frontend:
    image: node:20-alpine
    container_name: cloud-erp-frontend
    working_dir: /app
    restart: unless-stopped
    environment:
      VITE_API_URL: http://localhost:4100/api
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    command: sh -c "npm install && npm run dev -- --host 0.0.0.0"
    depends_on:
      - backend

volumes:
  postgres_data:
  backend_node_modules:
  frontend_node_modules:
EOF

# 2. Create start-cloudx.sh
cat > start-cloudx.sh << 'EOF'
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
EOF

# 3. Create stop-cloudx.sh
cat > stop-cloudx.sh << 'EOF'
#!/bin/bash

echo "🛑 Stopping NetCloudX/CloudERP..."
cd "$(dirname "$0")"

docker-compose -f docker-compose.dev.yml down

echo ""
echo "✅ NetCloudX/CloudERP stopped successfully"
echo ""
echo "   To start again: ./start-cloudx.sh"
echo ""
EOF

# 4. Create logs-cloudx.sh
cat > logs-cloudx.sh << 'EOF'
#!/bin/bash

cd "$(dirname "$0")"

echo "╔════════════════════════════════════════════════╗"
echo "║       📋 NetCloudX/CloudERP Logs               ║"
echo "║       (Press Ctrl+C to exit)                   ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

docker-compose -f docker-compose.dev.yml logs -f backend frontend
EOF

# Make all scripts executable
chmod +x start-cloudx.sh stop-cloudx.sh logs-cloudx.sh

echo ""
echo "✅ Setup complete!"
echo ""
echo "Files created/updated:"
echo "  ✓ docker-compose.dev.yml (backend port: 4100)"
echo "  ✓ start-cloudx.sh"
echo "  ✓ stop-cloudx.sh"
echo "  ✓ logs-cloudx.sh"
echo ""
echo "To start NetCloudX/CloudERP:"
echo "  ./start-cloudx.sh"
echo ""

