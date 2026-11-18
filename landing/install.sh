#!/usr/bin/env bash
# ============================================================
# NimbusPanel One-Line Installer
#
#   curl -sSL https://nimbus.sauu.fi/install.sh | bash
#
# Works on: Ubuntu 22.04/24.04, Debian 12 (fresh install)
# ============================================================
set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }
step()  { echo -e "\n${BOLD}=== $* ===${NC}"; }

VERSION="v1.0"
URL="https://nimbus.sauu.fi/nimbuspanel-${VERSION}.tar.gz"

echo -e "${BOLD}"
cat << 'EOF'
    _   __     __  ____             __  ___
   / | / /__  / /_/ __ \____  _____/  |/  /___ _____  ____ _____ ____  _____
  /  |/ / _ \/ __/ / / / __ \/ ___/ /|_/ / __ `/ __ \/ __ `/ __ `/ _ \/ ___/
 / /|  /  __/ /_/ /_/ / /_/ / /  / /  / / /_/ / / / / /_/ / /_/ /  __/ /
/_/ |_/\___/\__/____/\____/_/  /_/  /_/\__,_/_/ /_/\__,_/\__, /\___/_/
                                                        /____/
EOF
echo -e "${NC}"
echo "  The lightweight hosting control panel for PHP & Node.js"
echo "  ${VERSION} · https://github.com/sauufi/nimbuspanel"
echo ""

# ---- Preflight ----
step "Checking system"

[ "$(id -u)" -eq 0 ] || fail "Run as root: curl -sSL ${URL%/*}/install.sh | bash"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS="${ID:-unknown} ${VERSION_ID:-}"
else
    OS="unknown"
fi

case "$OS" in
    "Ubuntu 24.04" | "Ubuntu 22.04" | "Debian 12") info "OS: $OS" ;;
    *) warn "OS '$OS' is untested (Ubuntu 24.04 / Debian 12 recommended). Continuing anyway..." ;;
esac

RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
DISK_GB=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')

[ "$RAM_MB" -ge 700 ] || fail "Need at least 700MB RAM (found ${RAM_MB}MB)"
[ "$DISK_GB" -ge 5 ] || fail "Need at least 5GB disk (found ${DISK_GB}GB)"

info "RAM: ${RAM_MB}MB · Disk: ${DISK_GB}GB free"
info "Hostname: $(hostname)"

# ---- Download ----
step "Downloading NimbusPanel ${VERSION}"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

curl -fsSL "$URL" -o "$TMPDIR/nimbuspanel.tar.gz" || fail "Download failed from $URL"
info "Downloaded $(du -h "$TMPDIR/nimbuspanel.tar.gz" | cut -f1)"

cd "$TMPDIR"
tar xzf nimbuspanel.tar.gz || fail "Extract failed"
[ -d "provision" ] || fail "Invalid archive (provision/ not found)"
info "Extracted successfully"

# ---- Provision ----
step "Provisioning server (nginx, PHP, Node.js, MariaDB, mail, SSL, firewall)"

if [ -f "provision/provision.sh" ]; then
    bash provision/provision.sh --tz "$(cat /etc/timezone 2>/dev/null || echo UTC)" 2>&1 | while IFS= read -r line; do
        case "$line" in
            *"OK"*) info "$(echo "$line" | sed 's/.*INFO\] //')" ;;
            *"WARN"*) warn "$(echo "$line" | sed 's/.*WARN\] //')" ;;
            *"ERROR"*) echo -e "${RED}$line${NC}" ;;
        esac
    done
    [ ${PIPESTATUS[0]} -eq 0 ] || fail "Provisioning failed"
else
    fail "provision/provision.sh not found"
fi

info "Server provisioned successfully"

# ---- Deploy panel ----
step "Building & deploying NimbusPanel"

if [ -f "scripts/deploy.sh" ]; then
    bash scripts/deploy.sh 2>&1 | while IFS= read -r line; do
        case "$line" in
            *"[deploy]"*) info "$(echo "$line" | sed 's/\[deploy\] //')" ;;
            *"active"*) info "Service: $line" ;;
        esac
    done
    [ ${PIPESTATUS[0]} -eq 0 ] || fail "Deploy failed"
else
    fail "scripts/deploy.sh not found"
fi

info "Panel deployed"

# ---- Cleanup ----
step "Cleaning up"

# Keep the source for future updates
rm -rf /root/panel 2>/dev/null
mv "$TMPDIR" /root/nimbuspanel
npm cache clean --force 2>/dev/null || true
rm -rf /root/nimbuspanel/frontend/node_modules /root/nimbuspanel/backend/node_modules 2>/dev/null || true
apt-get clean 2>/dev/null || true

info "Source saved to /root/nimbuspanel"
info "Build cache cleaned"

# ---- Summary ----
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "your-server-ip")

echo -e "\n${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║  ☁️  NimbusPanel is ready!                                    ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Panel URL:${NC}  http://${SERVER_IP}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "  1. Open ${YELLOW}http://${SERVER_IP}${NC} in your browser"
echo -e "  2. Create your admin account (first-run setup)"
echo -e "  3. Go to ${YELLOW}Settings${NC} → set your domain + SSL"
echo -e "  4. Add sites, databases, mailboxes — done!"
echo ""
echo -e "  ${BOLD}Source code:${NC}  /root/nimbuspanel"
echo -e "  ${BOLD}GitHub:${NC}        https://github.com/sauufi/nimbuspanel"
echo -e "  ${BOLD}Landing page:${NC}  https://nimbus.sauu.fi"
echo ""
