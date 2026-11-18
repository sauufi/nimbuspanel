#!/usr/bin/env bash
# 31-apache.sh — Apache sebagai application server di belakang nginx
# Mode "apache" per situs: .htaccess bekerja apa adanya (rewrite, auth, deny).
# - Apache listens ONLY on 127.0.0.1:8081 (not exposed, no nginx conflict)
# - TLS tetap di nginx; Apache menerima trafik proxy polos
# - PHP tetap lewat pool PHP-FPM per situs yang sama (socket unix),
#   lewat mod proxy_fcgi — jadi pool dipakai bersama mode nginx/apache
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

ensure_pkgs apache2

# Hanya loopback:8081 — semua trafik publik tetap lewat nginx
cat > /etc/apache2/ports.conf <<'EOF'
# dikelola provisioning panel — apache hanya di belakang nginx
Listen 127.0.0.1:8081
EOF

a2enmod proxy proxy_fcgi setenvif headers rewrite expires >/dev/null
a2dissite 000-default >/dev/null 2>&1 || true

apache2ctl configtest >/dev/null 2>&1 || { apache2ctl configtest; die "invalid apache configuration"; }
systemctl enable --now apache2
systemctl restart apache2

info "Apache OK on 127.0.0.1:8081 (.htaccess mode ready; mods: proxy_fcgi, rewrite, headers, expires)"
