#!/usr/bin/env bash
# Start ITSM development servers (Linux / macOS)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

GRN='\033[0;32m'; CYN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

echo -e "${CYN}${BOLD}Starting ITSM Platform...${NC}"

# Start Django backend
(cd backend && DJANGO_SETTINGS_MODULE=config.settings.local RUN_MAIN=true \
    ./venv/bin/python manage.py runserver 0.0.0.0:8000 &)

# Start Vite frontend
(cd frontend && npm run dev &)

echo ""
echo -e "${GRN}${BOLD}Both servers starting...${NC}"
echo ""
echo "  Application : http://localhost:3000"
echo "  API Docs    : http://localhost:8000/api/docs/"
echo ""
echo "  Admin       : admin@helpdesk.local     / Admin@ITSM2025!"
echo "  IT Manager  : itmanager@helpdesk.local / Manager@ITSM2025!"
echo "  IT Agent    : agent1@helpdesk.local    / Agent@ITSM2025!"
echo ""
echo "Press Ctrl+C to stop all servers."

wait
