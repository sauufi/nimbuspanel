#!/usr/bin/env bash
# 40-php.sh — PHP multi-versi via FPM, repo packages.sury.org
# Tiap versi punya service php<X>-fpm sendiri; pool per situs ditambah panel fase 1.
#
# Uses PHP_REPO_CODENAME from lib.sh (dynamically resolved):
#   - Direct match if OS codename is available at sury.org
#   - Fallback to nearest LTS codename for newer releases
# This supports Debian 12+ (bookworm/trixie) and Ubuntu 22.04+ (jammy/noble)
# including future releases that haven't been added to sury yet.
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

# shellcheck disable=SC2206
PHP_LIST=(${PANEL_PHP:-${PHP_VERSIONS[*]}})

# PHP_REPO_CODENAME is set by lib.sh detect_os() — already validated with fallback
if [ -z "${PHP_REPO_CODENAME:-}" ]; then
    die "PHP_REPO_CODENAME not set — lib.sh detect_os() must run first"
fi

KEYRING="/usr/share/keyrings/deb.sury.org-php.gpg"
if [ ! -f "$KEYRING" ]; then
    curl -fsSL --retry 3 https://packages.sury.org/php/apt.gpg -o "$KEYRING"
fi
echo "deb [signed-by=$KEYRING] https://packages.sury.org/php/ $PHP_REPO_CODENAME main" \
    > /etc/apt/sources.list.d/sury-php.list

apt-get -o Acquire::Retries=3 update -qq

for v in "${PHP_LIST[@]}"; do
    pkgs=()
    for e in "${PHP_EXTENSIONS[@]}"; do
        pkgs+=("php$v-$e")
    done
    ensure_pkgs "${pkgs[@]}"

    # Ini global per versi (fpm + cli); tuning per-situs via pool panel fase 1
    INI="/etc/php/$v/mods-available/panel.ini"
    cat > "$INI" <<'EOF'
; dikelola provisioning panel
expose_php = Off
EOF
    phpenmod -v "$v" panel
    systemctl enable --now "php$v-fpm"
    info "PHP $v OK ($(/usr/bin/php$v -r 'echo PHP_VERSION;'))"
done
