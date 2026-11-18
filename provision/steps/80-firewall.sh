#!/usr/bin/env bash
# 80-firewall.sh — UFW (hanya 22/80/443) + fail2ban untuk SSH
# The panel backend listens on 127.0.0.1 behind nginx → no extra port needed.
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

# Allow SSH dulu SEBELUM enable supaya sesi sekarang tidak terputus
ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# fail2ban: jail SSH eksplisit dengan backend systemd (aman walau tanpa rsyslog)
cat > /etc/fail2ban/jail.d/panel.local <<'EOF'
[sshd]
enabled = true
backend = systemd
EOF

systemctl enable --now fail2ban
systemctl restart fail2ban

info "Firewall OK:"
ufw status | sed 's/^/    /' | tee -a "$LOG_FILE"
