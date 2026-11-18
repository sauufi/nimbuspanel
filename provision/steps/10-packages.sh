#!/usr/bin/env bash
# 10-packages.sh — paket dasar sistem + auto security updates
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

ensure_pkgs \
    curl wget git unzip tar xz-utils jq rsync cron \
    ca-certificates gnupg software-properties-common \
    ufw fail2ban python3-systemd unattended-upgrades \
    build-essential pkg-config python3 sqlite3 logrotate

# Security update otomatis harian
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

systemctl enable --now cron
info "Base packages OK (incl. unattended-upgrades)"
