#!/usr/bin/env bash
# ============================================================
# provision.sh — FASE 0
# Menyiapkan server Ubuntu 22.04/24.04 atau Debian 12 yang
# bersih menjadi "siap panel":
#
#   paket dasar, user 'panel', nginx, PHP multi-versi (FPM),
#   Node.js di /opt/node, MariaDB, acme.sh, UFW, fail2ban,
#   struktur direktori panel, sudo whitelist + helper root.
#
# Pemakaian (di server, sebagai root):
#   sudo bash provision.sh [--tz Asia/Jakarta]
#                          [--email kamu@contoh.com]
#                          [--php "8.2 8.3"]
#                          [--node "22"]
#                          [--swap auto|none|2G]
#                          [--harden-ssh]
#
# Idempoten: aman dijalankan berulang kali — yang sudah benar
# dilewati, log di /var/log/panel-provision.log
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/lib.sh"

export PANEL_TZ="" PANEL_SWAP="auto" PANEL_HARDEN_SSH="0" PANEL_ACME_EMAIL=""
export PANEL_PHP="" PANEL_NODE=""

need_value() { [ $# -ge 2 ] || { echo "Flag $1 requires a value" >&2; exit 64; }; }
while (($#)); do
    case "$1" in
        --tz)         need_value "$@"; PANEL_TZ="$2"; shift 2 ;;
        --email)      need_value "$@"; PANEL_ACME_EMAIL="$2"; shift 2 ;;
        --php)        need_value "$@"; PANEL_PHP="$2"; shift 2 ;;
        --node)       need_value "$@"; PANEL_NODE="$2"; shift 2 ;;
        --swap)       need_value "$@"; PANEL_SWAP="$2"; shift 2 ;;
        --harden-ssh) PANEL_HARDEN_SSH="1"; shift ;;
        -h | --help)  sed -n 's/^# \{0,1\}//p' "$0" | head -n 22; exit 0 ;;
        *)            echo "Unknown argument: $1 (see --help)" >&2; exit 64 ;;
    esac
done

require_root
mkdir -p "$(dirname "$LOG_FILE")" && touch "$LOG_FILE"
info "=== Provisioning started: $OS_ID $OS_VERSION ($OS_CODENAME) ==="

for step in "$SCRIPT_DIR"/steps/[0-9]*.sh; do
    info ">>> Step: $(basename "$step")"
    bash "$step" || die "Failed at step: $step (see $LOG_FILE)"
done

info "=== Provisioning finished ==="
info "Run verification:  sudo bash $SCRIPT_DIR/verify.sh"
