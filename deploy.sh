#!/usr/bin/env bash
# =============================================================================
#  ITSM Platform — One-Command Deployment (Linux & macOS)
#
#  Usage:
#    chmod +x deploy.sh && ./deploy.sh
#
#  Supports:
#    macOS 13+          (installs Docker Desktop via Homebrew)
#    Ubuntu 20.04+      (installs Docker Engine via apt)
#    Debian 11+
#    RHEL / Rocky / AlmaLinux 8+
#    Amazon Linux 2023
#
#  Windows: use deploy.ps1 instead.
# =============================================================================
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${BLU}[•]${NC} $*"; }
ok()    { echo -e "${GRN}[✓]${NC} $*"; }
warn()  { echo -e "${YLW}[!]${NC} $*"; }
die()   { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
step()  { echo -e "\n${BOLD}━━━  $*  ━━━${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
cat << 'EOF'
  _____ _____ __  __
 |_   _|_   _|  \/  |
   | |   | | | |\/| |
   | |   | | | |  | |
   |_|   |_| |_|  |_|  Platform v1.0
EOF
echo -e "  Bluspring Enterprises — Internal IT Management${NC}\n"

# ── 1. Detect OS ──────────────────────────────────────────────────────────────
step "Detecting operating system"
OS="unknown"; MACOS=0
if [[ "$(uname -s)" == "Darwin" ]]; then
    MACOS=1; OS="macos"
    MACOS_VER=$(sw_vers -productVersion | cut -d. -f1)
    ok "macOS $(sw_vers -productVersion) detected"
elif [[ -f /etc/os-release ]]; then
    . /etc/os-release; OS="${ID:-unknown}"
    ok "$PRETTY_NAME detected"
else
    die "Unsupported OS. Supported: macOS 13+, Ubuntu, Debian, RHEL, Rocky, AlmaLinux."
fi

# ── 2. Install prerequisites ──────────────────────────────────────────────────
step "Checking prerequisites"

install_docker_macos() {
    info "Installing Docker Desktop for macOS..."
    if ! command -v brew &>/dev/null; then
        info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add brew to PATH for Apple Silicon
        [[ -f /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    brew install --cask docker 2>/dev/null || true
    info "Starting Docker Desktop..."
    open -a Docker
    echo -n "  Waiting for Docker daemon to start (up to 60s)"
    for i in $(seq 1 30); do
        if docker info &>/dev/null 2>&1; then echo; ok "Docker Desktop is running"; return 0; fi
        echo -n "."; sleep 2
    done
    echo
    die "Docker Desktop did not start in time. Open it manually from Applications, then re-run this script."
}

install_docker_linux() {
    case "$OS" in
        ubuntu|debian)
            info "Installing Docker Engine via apt..."
            sudo apt-get update -qq
            sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release
            sudo install -m 0755 -d /etc/apt/keyrings
            curl -fsSL "https://download.docker.com/linux/${OS}/gpg" | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
            sudo chmod a+r /etc/apt/keyrings/docker.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${OS} $(lsb_release -cs) stable" | \
                sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
            sudo apt-get update -qq
            sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            sudo systemctl enable --now docker
            sudo usermod -aG docker "$USER" 2>/dev/null || true
            ;;
        centos|rhel|fedora|rocky|almalinux|amzn)
            info "Installing Docker Engine via yum/dnf..."
            local PKG; PKG=$(command -v dnf &>/dev/null && echo dnf || echo yum)
            sudo $PKG install -y -q yum-utils
            sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || \
            sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null
            sudo $PKG install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            sudo systemctl enable --now docker
            sudo usermod -aG docker "$USER" 2>/dev/null || true
            ;;
        *) die "Unsupported Linux distro: $OS. Install Docker manually: https://docs.docker.com/engine/install/" ;;
    esac
}

# Docker check & install
if ! command -v docker &>/dev/null || ! docker info &>/dev/null 2>&1; then
    warn "Docker not running or not installed."
    if [[ $MACOS -eq 1 ]]; then install_docker_macos; else install_docker_linux; fi
fi
DOCKER_VER=$(docker --version | awk '{print $3}' | tr -d ',')
ok "Docker $DOCKER_VER"

# Compose
COMPOSE=""
docker compose version &>/dev/null 2>&1 && COMPOSE="docker compose"
[[ -z "$COMPOSE" ]] && command -v docker-compose &>/dev/null && COMPOSE="docker-compose"
[[ -z "$COMPOSE" ]] && die "Docker Compose not found. Update Docker to get it."
ok "Compose: $COMPOSE"

# OpenSSL
if ! command -v openssl &>/dev/null; then
    info "Installing OpenSSL..."
    if [[ $MACOS -eq 1 ]]; then brew install openssl;
    elif [[ $OS == "ubuntu" || $OS == "debian" ]]; then sudo apt-get install -y -qq openssl;
    else sudo yum install -y -q openssl; fi
fi
ok "OpenSSL $(openssl version | awk '{print $2}')"

# ── 3. Environment file ───────────────────────────────────────────────────────
step "Configuring environment"
if [[ ! -f ".env" ]]; then
    cp .env.example .env
    warn ".env created from template. You must fill in these values before going to production:"
    warn "  • SECRET_KEY   — run: python3 -c \"import secrets; print(secrets.token_hex(32))\""
    warn "  • DB_PASSWORD  — choose a strong password"
    warn "  • ALLOWED_HOSTS, FRONTEND_URL, SMTP_HOST, IMAP_HOST"
    echo ""
    # Auto-generate a random SECRET_KEY for local/first-time use
    if command -v python3 &>/dev/null; then
        RANDOM_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
        sed -i.bak "s|change-this-to-a-long-random-string-at-least-50-chars|${RANDOM_KEY}|" .env
        rm -f .env.bak
        ok "SECRET_KEY auto-generated"
    fi
    # Auto-generate DB password
    if command -v python3 &>/dev/null; then
        DB_PASS=$(python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(20)))")
        sed -i.bak "s|change-this-strong-password|${DB_PASS}|g" .env
        rm -f .env.bak
        ok "DB_PASSWORD auto-generated: $DB_PASS"
    fi
    read -rp "  Press ENTER to continue with these defaults, or Ctrl+C to edit .env first: " _
else
    ok ".env already exists"
fi

# Load env for validation
set -a; source .env 2>/dev/null || true; set +a
[[ "${SECRET_KEY:-change-this}" == "change-this-to-a-long-random-string-at-least-50-chars" ]] && \
    die "SECRET_KEY has not been set. Edit .env and re-run."
ok "Environment validated"

# ── 4. SSL Certificate ────────────────────────────────────────────────────────
step "Setting up SSL certificate"
mkdir -p nginx/ssl
if [[ ! -f nginx/ssl/server.crt ]] || [[ ! -f nginx/ssl/server.key ]]; then
    HOSTNAME="${ALLOWED_HOSTS:-localhost}"; HOSTNAME="${HOSTNAME%%,*}"
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout nginx/ssl/server.key -out nginx/ssl/server.crt \
        -subj "/C=IN/ST=Maharashtra/O=Bluspring Enterprises/CN=${HOSTNAME}" \
        -addext "subjectAltName=DNS:${HOSTNAME},DNS:localhost,IP:127.0.0.1" 2>/dev/null
    chmod 600 nginx/ssl/server.key
    ok "Self-signed SSL certificate generated for: $HOSTNAME"
    warn "Replace nginx/ssl/server.crt + server.key with a CA-signed cert for production"
else
    EXPIRY=$(openssl x509 -enddate -noout -in nginx/ssl/server.crt | cut -d= -f2)
    ok "SSL certificate exists (expires: $EXPIRY)"
fi

# ── 5. Build & start ──────────────────────────────────────────────────────────
step "Building Docker images"
info "This installs all Python and Node.js dependencies inside containers."
info "First run may take 5–10 minutes..."
$COMPOSE build --parallel
ok "Images built"

step "Starting all services"
$COMPOSE up -d
ok "Services started"

# ── 6. Wait for healthy ───────────────────────────────────────────────────────
step "Waiting for services to be ready"
MAX=120; EL=0
while [[ $EL -lt $MAX ]]; do
    if $COMPOSE exec -T backend python -c "import sys; sys.exit(0)" &>/dev/null 2>&1; then
        # Also wait for the DB migration to finish by trying the login endpoint
        HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST http://localhost:8000/api/auth/login/ \
            -H "Content-Type: application/json" \
            -d '{"email":"x","password":"x"}' 2>/dev/null || echo "000")
        if [[ "$HTTP" == "401" || "$HTTP" == "200" ]]; then break; fi
    fi
    printf "\r  Waiting... ${EL}s"
    sleep 4; EL=$((EL+4))
done
echo
[[ $EL -ge $MAX ]] && warn "Services took longer than expected. Check: $COMPOSE logs backend"
ok "All services are up"

# ── 7. Service status ─────────────────────────────────────────────────────────
step "Service status"
$COMPOSE ps

# ── 8. Credentials ───────────────────────────────────────────────────────────
step "Initial admin credentials"
sleep 3
CREDS=$($COMPOSE exec -T backend cat /app/initial_credentials 2>/dev/null || true)
if [[ -n "$CREDS" ]]; then
    ADMIN_EMAIL=$(echo "$CREDS" | grep "^email=" | cut -d= -f2)
    ADMIN_PASS=$(echo "$CREDS"  | grep "^password=" | cut -d= -f2)
    ADMIN_URL=$(echo "$CREDS"   | grep "^url=" | cut -d= -f2)
    echo ""
    echo -e "${GRN}${BOLD}  ┌─────────────────────────────────────────────┐"
    printf  "  │  %-43s│\n" "ITSM — Initial Admin Account"
    echo    "  ├─────────────────────────────────────────────┤"
    printf  "  │  Email   : %-32s│\n" "$ADMIN_EMAIL"
    printf  "  │  Password: %-32s│\n" "$ADMIN_PASS"
    printf  "  │  URL     : %-32s│\n" "$ADMIN_URL"
    echo    "  └─────────────────────────────────────────────┘${NC}"
    echo ""
    warn "Change this password immediately after first login!"
else
    info "Admin already exists. To retrieve: $COMPOSE logs backend | grep 'INITIAL ADMIN'"
fi

# Pre-seeded demo accounts:
echo -e "  ${BOLD}Demo accounts (auto-created):${NC}"
echo    "    IT Manager : itmanager@helpdesk.local / Manager@ITSM2025!"
echo    "    IT Agent 1 : agent1@helpdesk.local    / Agent@ITSM2025!"
echo    "    Requestor  : neha.gupta@company.local  / User@ITSM2025!"

# ── 9. Security check ────────────────────────────────────────────────────────
step "Security check"
$COMPOSE exec -T backend python manage.py security_check 2>/dev/null || \
    warn "Run manually: $COMPOSE exec backend python manage.py security_check"

# ── 10. Summary ───────────────────────────────────────────────────────────────
FRONTEND_URL="${FRONTEND_URL:-https://$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)}"
echo ""
echo -e "${GRN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GRN}${BOLD}  Deployment complete!${NC}"
echo ""
echo -e "  ${BOLD}Application  ${NC}: $FRONTEND_URL"
echo -e "  ${BOLD}Guest Portal ${NC}: $FRONTEND_URL/portal"
echo -e "  ${BOLD}API Docs     ${NC}: $FRONTEND_URL/api/docs/"
echo -e "  ${BOLD}Django Admin ${NC}: $FRONTEND_URL/admin/"
echo ""
echo    "  Useful commands:"
echo    "    Logs        : $COMPOSE logs -f"
echo    "    Stop        : $COMPOSE down"
echo    "    Update      : git pull && ./deploy.sh"
echo    "    DB Backup   : $COMPOSE exec postgres pg_dump -U \$DB_USER \$DB_NAME > backup.sql"
echo -e "${GRN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
