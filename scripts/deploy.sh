#!/usr/bin/env bash
# ============================================================
# deploy.sh — build & rilis panel (backend + frontend) ke server ini.
# Jalankan DI SERVER sebagai root, dari folder mana pun:
#   sudo bash scripts/deploy.sh
#
# Build on the server so native modules (better-sqlite3) match the
# so native modules match the platform. Releases use the releases/current + systemd pattern.
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="/opt/node/v22/bin"
export PATH="$NODE_BIN:$PATH"

info()  { echo "[deploy] $*"; }
die()   { echo "[deploy] GAGAL: $*" >&2; exit 1; }

command -v node >/dev/null || die "Node not found at $NODE_BIN (run provisioning first)"
node -v | grep -q '^v22' || die "Node major must be 22, found: $(node -v)"

info "Building frontend (vite)..."
(cd "$REPO_ROOT/frontend" && npm install --no-audit --no-fund && npm run build)

info "Building backend (tsc) + pruning devDependencies..."
(cd "$REPO_ROOT/backend" && npm install --no-audit --no-fund && npm run build && npm prune --omit=dev)

REL="/opt/panel/backends/releases/$(date +%Y%m%d-%H%M%S)"
info "Release: $REL"
mkdir -p "$REL"
cp -r "$REPO_ROOT/backend/dist" "$REPO_ROOT/backend/node_modules" "$REPO_ROOT/backend/package.json" "$REL/"
cp -r "$REPO_ROOT/frontend/dist" "$REL/public"
chown -R panel:panel /opt/panel/backends
ln -sfn "$REL" /opt/panel/backends/current

# NOTE: deliberately WITHOUT NoNewPrivileges/ProtectSystem — the panel needs
# to exec sudo (whitelisted helpers) which requires setuid.
cat > /etc/systemd/system/panel.service <<'EOF'
[Unit]
Description=Panel backend (PHP+Node hosting)
After=network.target

[Service]
User=panel
Group=panel
WorkingDirectory=/opt/panel/backends/current
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3444
Environment=PANEL_DB=/opt/panel/etc/panel.db
ExecStart=/opt/node/v22/bin/node dist/index.js
Restart=always
RestartSec=3
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable panel >/dev/null
systemctl restart panel
sleep 2

systemctl is-active panel || { journalctl -u panel --no-pager -n 30; die "panel.service is not active"; }
info "Done: panel active on 127.0.0.1:3444 — install the nginx vhost (infra/panel-vhost.example.conf)"

# ---- Auto-cleanup: prevent disk from filling up on small VPS ----
info "Cleaning up build artifacts..."

# npm cache (biggest offender: 1.8GB per deploy)
npm cache clean --force 2>/dev/null || true

# node_modules from build source (only needed during build, not after)
rm -rf "$REPO_ROOT/frontend/node_modules" "$REPO_ROOT/backend/node_modules"

# old releases — keep only the 2 newest
RELEASE_DIR="/opt/panel/backends/releases"
if [ -d "$RELEASE_DIR" ]; then
    (cd "$RELEASE_DIR" && ls -1 | sort | head -n -2 | while read -r old; do
        rm -rf "$RELEASE_DIR/$old"
    done)
fi

# apt cache
apt-get clean 2>/dev/null || true

# journal logs
journalctl --vacuum-size=20M 2>/dev/null || true

info "Cleanup done. Disk: $(df -h / | awk 'NR==2 {print $4}') free"
