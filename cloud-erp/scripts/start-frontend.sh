#!/bin/sh
docker run --rm --name cloud-erp-frontend \
  --network host \
  -v "/Users/adnanwiratama/Project X/ERP Custom/cloud-erp/frontend:/app" \
  -w /app \
  -e VITE_API_URL=http://localhost:4100/api \
  node:20-alpine \
  sh -c "npm run dev -- --host 0.0.0.0"
