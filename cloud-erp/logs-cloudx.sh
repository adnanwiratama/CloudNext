#!/bin/bash

cd "$(dirname "$0")"

echo "╔════════════════════════════════════════════════╗"
echo "║       📋 NetCloudX/CloudERP Logs               ║"
echo "║       (Press Ctrl+C to exit)                   ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

docker-compose -f docker-compose.dev.yml logs -f backend frontend
