#!/usr/bin/env bash
# 70-acme.sh — acme.sh (klien Let's Encrypt) sebagai root di /etc/panel/acme
# Issue/renew digerakkan helper sudo panel-issue-ssl; cron renewal otomatis.
#
# Dipasang langsung dari tarball GitHub resmi, BUKAN lewat bootstrap
# `curl get.acme.sh | sh -s --`: bootstrap itu merusak argumen saat
# diteruskan ke installer (bug "Unknown parameter: ----home"), jadi
# argumen --home/--certhome kita eksekusi sendiri langsung ke ./acme.sh.
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

# socat: dependensi resmi acme.sh (mode standalone/ tls-alpn); cron: renewal
ensure_pkgs curl cron socat

mkdir -p "$ACME_HOME"
chmod 0700 "$ACME_HOME"

if [ ! -f "$ACME_HOME/acme.sh" ]; then
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    info "Downloading acme.sh from github.com/acmesh-official/acme.sh..."
    curl -fsSL --retry 3 \
        https://github.com/acmesh-official/acme.sh/archive/master.tar.gz \
        | tar -xz -C "$TMP"

    ARGS=(--install --home "$ACME_HOME" --certhome "$ACME_HOME/certs")
    [ -n "${PANEL_ACME_EMAIL:-}" ] && ARGS+=(--accountemail "$PANEL_ACME_EMAIL")
    (cd "$TMP/acme.sh-master" && ./acme.sh "${ARGS[@]}")
fi

# Default CA = Let's Encrypt (bukan ZeroSSL bawaan acme.sh)
"$ACME_HOME/acme.sh" --home "$ACME_HOME" --set-default-ca --server letsencrypt >/dev/null

if ! crontab -l 2>/dev/null | grep -q "$ACME_HOME"; then
    "$ACME_HOME/acme.sh" --home "$ACME_HOME" --install-cronjob
    crontab -l 2>/dev/null | grep -q "$ACME_HOME" \
        || warn "acme.sh renewal cron not installed — check manually: crontab -l"
fi

info "acme.sh OK at $ACME_HOME (default CA: Let's Encrypt)"
