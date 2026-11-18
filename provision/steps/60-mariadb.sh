#!/usr/bin/env bash
# 60-mariadb.sh — MariaDB (root via unix socket, tanpa password root)
# Panel fase 3 membuat database/user lewat helper sudo `panel-db-exec`.
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

ensure_pkgs mariadb-server mariadb-client
systemctl enable --now mariadb

# Non-interactive replacement for `mariadb-secure-installation` (idempotent).
# Root MariaDB memakai unix_socket auth → hanya user root sistem yang bisa masuk,
# there is no root password that could leak/be attacked from the network (port not exposed).
mariadb <<'SQL'
DELETE FROM mysql.user WHERE User='';
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db LIKE 'test%';
FLUSH PRIVILEGES;
SQL

info "MariaDB OK ($(/usr/bin/mariadb -N -B -e 'SELECT VERSION();')) via unix socket"
