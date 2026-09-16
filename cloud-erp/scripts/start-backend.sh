#!/bin/sh
BACKEND_DIR="/Users/adnanwiratama/Project X/ERP Custom/cloud-erp/backend"
docker run --rm --name cloud-erp-backend \
  --network host \
  -v "$BACKEND_DIR:/app" \
  -w /app \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_NAME=cloud_erp \
  -e DB_USER=erp_user \
  -e DB_PASSWORD=erp_secure_password \
  -e JWT_SECRET=cloud-erp-super-secret-key-2026 \
  -e APP_PORT=4100 \
  -e NODE_ENV=development \
  -e CORS_ORIGINS=http://localhost:5173 \
  -e LOG_LEVEL=info \
  node:20-alpine \
  sh -c "npx ts-node-dev --respawn --transpile-only --exit-child src/index.ts"
