#!/bin/bash

echo "🛑 Stopping NetCloudX/CloudERP..."
cd "$(dirname "$0")"

docker-compose -f docker-compose.dev.yml down

echo ""
echo "✅ NetCloudX/CloudERP stopped successfully"
echo ""
echo "   To start again: ./start-cloudx.sh"
echo ""
