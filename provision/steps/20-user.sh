#!/usr/bin/env bash
# 20-user.sh — user 'panel', struktur direktori /opt/panel dan /var/www
#
# Catatan keamanan: /opt/panel dan /opt/panel/bin WAJIB root-owned.
# The panel backend (user 'panel') must never be able to write/replace bin/ —
# karena file di sana dipanggil via sudo whitelist (root). Kalau panel bisa
# mengedit bin/, whitelist sudo = celah eskalasi ke root.
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

id -u "$PANEL_USER" &>/dev/null || \
    useradd -r -d "$PANEL_HOME" -s /usr/sbin/nologin -c "Panel service user" "$PANEL_USER"

mkdir -p "$PANEL_HOME"/{bin,etc,backends,templates,logs} "$WWW_ROOT" "$BACKUP_DIR"

chown root:root "$PANEL_HOME" "$PANEL_HOME/bin" "$WWW_ROOT" "$BACKUP_DIR"
chmod 0755 "$PANEL_HOME" "$PANEL_HOME/bin" "$WWW_ROOT"
chmod 0700 "$BACKUP_DIR"

for d in etc backends templates logs; do
    chown "$PANEL_USER:$PANEL_USER" "$PANEL_HOME/$d"
    chmod 0750 "$PANEL_HOME/$d"
done

info "User $PANEL_USER + directory layout OK (/opt/panel, $WWW_ROOT, $BACKUP_DIR)"
