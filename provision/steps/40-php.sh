#!/usr/bin/env bash
# 40-php.sh — PHP multi-versi via FPM, repo packages.sury.org
# Tiap versi punya service php<X>-fpm sendiri; pool per situs ditambah panel fase 1.
#
# The sury repo is used for both Debian AND Ubuntu (noble/jammy available there).
# The ondrej/php Launchpad PPA is being phased out — and add-apt-repository
# needs api.launchpad.net which often times out on some VPS networks,
# so the repo is written manually + the key is fetched from the same host as the packages.
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

# shellcheck disable=SC2206
PHP_LIST=(${PANEL_PHP:-${PHP_VERSIONS[*]}})

case "${OS_CODENAME:-}" in
    bookworm | trixie | bullseye | noble | jammy) ;;
    *) die "OS codename '$OS_CODENAME' not available at packages.sury.org/php (check https://packages.sury.org/php/dists/)" ;;
esac

KEYRING="/usr/share/keyrings/deb.sury.org-php.gpg"
if [ ! -f "$KEYRING" ]; then
    curl -fsSL --retry 3 https://packages.sury.org/php/apt.gpg -o "$KEYRING"
fi
echo "deb [signed-by=$KEYRING] https://packages.sury.org/php/ $OS_CODENAME main" \
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
