#!/usr/bin/env bash
# =============================================================================
#  ITSM Platform - One-Step Installer (Linux / macOS)
#  Bluspring Enterprises
#
#  Usage: chmod +x setup.sh && ./setup.sh
#  Supports: Ubuntu 20.04+, Debian 11+, RHEL/Rocky 8+, macOS 13+
# =============================================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# ── Colours ───────────────────────────────────────────────────────────────────
GRN='\033[0;32m'; YLW='\033[1;33m'; RED='\033[0;31m'; CYN='\033[0;36m'
BLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GRN}  [OK] $*${NC}"; }
warn() { echo -e "${YLW}  [!] $*${NC}"; }
die()  { echo -e "${RED}  [X] $*${NC}" >&2; exit 1; }
step() { echo -e "\n${CYN}${BLD}[$1/8] $2${NC}"; }

echo -e "\n${CYN}${BLD}"
cat << 'BANNER'
  ======================================================
   ITSM Platform | Bluspring Enterprises
   One-Step Installer (Linux / macOS)
  ======================================================
BANNER
echo -e "${NC}"

MACOS=0; [[ "$(uname -s)" == "Darwin" ]] && MACOS=1
OS="linux"
[[ -f /etc/os-release ]] && { . /etc/os-release; OS="${ID:-linux}"; }

# ── 1. Python 3.11+ ───────────────────────────────────────────────────────────
step 1 "Checking Python 3.11+"
if command -v python3 &>/dev/null; then
    PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
    if [[ $PY_MAJOR -ge 3 && $PY_MINOR -ge 11 ]]; then
        ok "Python $PY_VER"
    else
        warn "Python $PY_VER found but 3.11+ required. Installing..."
        if [[ $MACOS -eq 1 ]]; then
            command -v brew &>/dev/null || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            brew install python@3.12
        elif [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
            sudo apt-get update -qq && sudo apt-get install -y python3.12 python3.12-venv python3.12-dev python3-pip
        elif [[ "$OS" =~ ^(rhel|rocky|centos|almalinux) ]]; then
            sudo dnf install -y python3.12 python3.12-devel
        else
            die "Cannot auto-install Python. Please install Python 3.11+ manually."
        fi
    fi
else
    if [[ $MACOS -eq 1 ]]; then
        command -v brew &>/dev/null || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        brew install python@3.12; ok "Python 3.12 installed"
    elif [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        sudo apt-get update -qq && sudo apt-get install -y python3.12 python3.12-venv python3-pip; ok "Python installed"
    else
        die "Python not found. Please install Python 3.11+ and re-run."
    fi
fi
PYTHON=$(command -v python3.12 || command -v python3 || echo python3)

# ── 2. Node.js 18+ ────────────────────────────────────────────────────────────
step 2 "Checking Node.js 18+"
if ! command -v node &>/dev/null; then
    warn "Node.js not found. Installing..."
    if [[ $MACOS -eq 1 ]]; then
        brew install node@20; ok "Node.js installed"
    elif [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs; ok "Node.js installed"
    elif [[ "$OS" =~ ^(rhel|rocky|centos|almalinux) ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo dnf install -y nodejs; ok "Node.js installed"
    else
        die "Node.js not found. Please install Node.js 18+ and re-run."
    fi
else
    ok "Node.js $(node --version)"
fi

# ── 3. OpenSSL & build tools ──────────────────────────────────────────────────
step 3 "Checking build tools"
if [[ $MACOS -eq 1 ]]; then
    command -v openssl &>/dev/null || brew install openssl; ok "OpenSSL ready"
elif [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    sudo apt-get install -y -qq build-essential openssl libssl-dev 2>/dev/null; ok "Build tools ready"
fi

# ── 4. Environment file ───────────────────────────────────────────────────────
step 4 "Setting up environment"
if [[ ! -f ".env" ]]; then
    cp .env.example .env
    # Auto-generate SECRET_KEY and DB_PASSWORD
    SK=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    DP=$(python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(20)))")
    sed -i.bak "s|change-this-to-a-long-random-string-at-least-50-chars|${SK}|" .env
    sed -i.bak "s|change-this-strong-password|${DP}|g" .env
    rm -f .env.bak
    ok ".env created with auto-generated secrets"
    warn "Review .env before production deployment"
else
    ok ".env already exists"
fi

# ── 5. Python virtualenv + packages ──────────────────────────────────────────
step 5 "Python virtual environment"
if [[ ! -d "backend/venv" ]]; then
    $PYTHON -m venv backend/venv; ok "Virtual environment created"
fi
echo "  Installing Python packages (this may take 2-3 minutes)..."
backend/venv/bin/pip install --quiet -r backend/requirements-local.txt || \
backend/venv/bin/pip install --quiet -r backend/requirements.txt
ok "Python packages installed"

# ── 6. Database migrations ────────────────────────────────────────────────────
step 6 "Database migrations"
(cd backend && DJANGO_SETTINGS_MODULE=config.settings.local ../backend/venv/bin/python manage.py migrate --noinput 2>&1 \
    | grep -E "Applying|OK|Error" | head -20)
ok "Migrations applied"

# ── 7. Seed data ──────────────────────────────────────────────────────────────
step 7 "Seeding initial data"
MANAGE="cd backend && DJANGO_SETTINGS_MODULE=config.settings.local ../backend/venv/bin/python manage.py"
(eval "$MANAGE setup_roles"        2>&1 | grep -E "Created|Exists" || true)
(eval "$MANAGE setup_config"       2>&1 | grep -E "Seeded|already" || true)
(eval "$MANAGE create_initial_admin" 2>&1 || true)
(eval "$MANAGE setup_demo_data"    2>&1 | grep -E "Created|Exists" || true)
ok "Seed data applied"

# ── 8. Frontend packages ──────────────────────────────────────────────────────
step 8 "Frontend packages"
(cd frontend && npm install --silent 2>&1 | tail -2)
ok "Frontend packages installed"

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "\n${GRN}${BLD}"
cat << 'DONE'
  ======================================================
   Setup Complete!
  ======================================================
DONE
echo -e "${NC}"
cat << 'HOWTO'
  To start the application:

    Using Procfile (recommended):
      pip install honcho && honcho start
      -- OR --
      brew install overmind && overmind start   (macOS)

    Manually:
      Terminal 1:  cd backend && DJANGO_SETTINGS_MODULE=config.settings.local \
                   ./venv/bin/python manage.py runserver 8000
      Terminal 2:  cd frontend && npm run dev

  URLs:
    Application  : http://localhost:3000
    API Docs     : http://localhost:8000/api/docs/
    Guest Portal : http://localhost:3000/portal

  Demo accounts:
    Admin    : admin@helpdesk.local         / Admin@ITSM2025!
    Manager  : itmanager@helpdesk.local     / Manager@ITSM2025!
    Agent    : agent1@helpdesk.local        / Agent@ITSM2025!
    User     : neha.gupta@company.local     / User@ITSM2025!

HOWTO
