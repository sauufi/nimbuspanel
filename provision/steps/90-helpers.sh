#!/usr/bin/env bash
# 90-helpers.sh — pasang helper root ke /opt/panel/bin + sudo whitelist
#
# Pola keamanan: panel backend TIDAK punya akses shell root bebas.
# Ia hanya boleh memanggil script di bawah ini via sudo, dan setiap script
# memvalidasi argumennya sendiri secara ketat (argumen dari panel dianggap
# untrusted). Files in /opt/panel/bin are always root-owned (see 20-user.sh).
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

ensure_pkgs sudo

# Panel perlu membaca journal (log aplikasi app-*) tanpa root
id -Gn "$PANEL_USER" 2>/dev/null | grep -qw systemd-journal || \
    usermod -aG systemd-journal "$PANEL_USER"

for f in "$STEP_ROOT"/bin/panel-*; do
    install -m 0755 -o root -g root "$f" "$PANEL_BIN/$(basename "$f")"
done

# Sudoers whitelist — ditulis ke file sementara, divalidasi visudo, baru dipasang
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
{
    echo "# Dikelola provisioning panel — JANGAN edit manual."
    echo "# Helper dipanggil panel backend via: sudo $PANEL_BIN/<nama> <arg>"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-systemctl *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-issue-ssl *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-provision-site *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-remove-site *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-node-deploy *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-node-rollback *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-write-env *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-read-env *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-db-manage *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-backup *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-write-nginx-rules *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-read-nginx-rules *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-install-adminer *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-file *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-mail *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-install-webmail *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-hostname *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-install-wordpress *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-site-ssh-setup *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-cron *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-git-token *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-node-releases *"
    echo "$PANEL_USER ALL=(root) NOPASSWD: $PANEL_BIN/panel-disk-usage"
} > "$TMP"

# Backup cron is managed by the panel-backup helper itself (it reads the
# settings stored in panel.db; defaults: daily at 02:30). Rewriting it
# here keeps a fresh install consistent with the panel settings.
"$PANEL_BIN/panel-backup" schedule >/dev/null 2>&1 || true

# Fresh install default: the panel answers on http://<server-ip>/ right
# away (no-op when a panel vhost already exists — e.g. after set-domain).
"$PANEL_BIN/panel-hostname" set-ip >/dev/null 2>&1 || true

visudo -cf "$TMP" >/dev/null || die "Invalid sudoers file — NOT installed"
install -m 0440 -o root -g root "$TMP" /etc/sudoers.d/panel

info "Helpers installed at $PANEL_BIN + sudoers whitelist OK"
ls -1 "$PANEL_BIN" | sed 's/^/    /' | tee -a "$LOG_FILE"
