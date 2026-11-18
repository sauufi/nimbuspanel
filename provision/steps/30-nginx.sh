#!/usr/bin/env bash
# 30-nginx.sh — nginx sebagai reverse proxy + vhost per situs
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

ensure_pkgs nginx

# Vhost default (halaman selamat datang) dimatikan — situs panel yang mengelola
rm -f /etc/nginx/sites-enabled/default

# Direktori sertifikat SSL; hanya dibaca nginx master (root)
mkdir -p "$SSL_DIR_ROOT"
chmod 0700 "$SSL_DIR_ROOT"

# Rotasi log per-situs (log ditulis panel ke /var/www/<domain>/logs)
cat > /etc/logrotate.d/panel-sites <<'EOF'
/var/www/*/logs/*.log {
    weekly
    rotate 8
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        [ -f /run/nginx.pid ] && kill -USR1 "$(cat /run/nginx.pid)" || true
    endscript
}
EOF

systemctl enable --now nginx
nginx -t
info "nginx OK ($(nginx -v 2>&1 | cut -d/ -f2))"
