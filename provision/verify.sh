#!/usr/bin/env bash
# ============================================================
# verify.sh — check the phase 0 provisioning results.
# Run as root after provision.sh:
#   sudo bash verify.sh
# Exit code 0 = all checks passed.
# ============================================================
set -uo pipefail   # no -e: collect every result first

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/config.sh"
. "$SCRIPT_DIR/lib.sh"

PASS=0; FAIL=0
ok()  { printf '  [OK]    %s\n' "$1"; PASS=$((PASS + 1)); }
bad() { printf '  [FAIL]  %s\n' "$1"; FAIL=$((FAIL + 1)); }
check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }

echo "== System =="
check "Running as root" test "$(id -u)" -eq 0
check "Supported OS (Ubuntu 22.04+, Debian 12+)" \
    bash -c '. /etc/os-release; case "$ID" in ubuntu) [ "${VERSION_ID%%.*}" -ge 22 ];; debian) [ "${VERSION_ID%%.*}" -ge 12 ];; *) false;; esac'
check "Unattended-upgrades enabled" test -f /etc/apt/apt.conf.d/20auto-upgrades
check "Cron active" systemctl is-active cron

echo "== nginx =="
check "Service active" systemctl is-active nginx
check "Configuration valid (nginx -t)" nginx -t
check "Default vhost disabled" test ! -e /etc/nginx/sites-enabled/default
check "SSL directory /etc/nginx/ssl" test -d "$SSL_DIR_ROOT"

echo "== PHP =="
for d in /etc/php/*/; do
    v="$(basename "$d")"
    check "PHP $v CLI" "/usr/bin/php$v" -v
    check "PHP $v FPM active" systemctl is-active "php$v-fpm"
done
[ -d /etc/php ] && [ "$(ls /etc/php 2>/dev/null | wc -l)" -gt 0 ] || bad "No PHP installed"

echo "== Node.js =="
found_node=0
for d in "$NODE_ROOT"/v*/; do
    [ -x "$d/bin/node" ] || continue
    found_node=1
    check "Node $("$d/bin/node" --version) at $d" "$d/bin/node" -e 'process.exit(0)'
done
[ "$found_node" -eq 1 ] || bad "No Node.js found in $NODE_ROOT"

echo "== Database =="
check "MariaDB active" systemctl is-active mariadb
check "Root unix socket connection" mariadb -N -B -e 'SELECT 1;'

echo "== SSL / acme.sh =="
check "acme.sh installed" test -x "$ACME_HOME/acme.sh"
check "acme.sh renewal cron" bash -c "crontab -l | grep -q '$ACME_HOME'"

echo "== Security =="
check "UFW active" bash -c 'ufw status | grep -q "Status: active"'
check "UFW port 80 open" bash -c 'ufw status | grep -qE "80/tcp.*(ALLOW)"'
check "UFW port 443 open" bash -c 'ufw status | grep -qE "443/tcp.*(ALLOW)"'
check "UFW port 22 open" bash -c 'ufw status | grep -qE "(22/tcp|OpenSSH).*(ALLOW)"'
check "fail2ban active" systemctl is-active fail2ban
check "User $PANEL_USER exists" id -u "$PANEL_USER"
check "Panel sudoers valid" visudo -cf /etc/sudoers.d/panel
check "$PANEL_BIN root-owned 0755" bash -c "[ \"\$(stat -c '%U:%a %n' $PANEL_BIN/panel-systemctl)\" = 'root:755 $PANEL_BIN/panel-systemctl' ]"
check "Home $PANEL_HOME not writable by panel" bash -c "[ \"\$(stat -c '%U' $PANEL_HOME)\" = 'root' ]"
check "Helper issue-ssl present" test -x "$PANEL_BIN/panel-issue-ssl"
check "Helper provision-site present" test -x "$PANEL_BIN/panel-provision-site"
check "Helper remove-site present" test -x "$PANEL_BIN/panel-remove-site"
check "Sudoers lists provision-site" grep -q "panel-provision-site" /etc/sudoers.d/panel
# -n: never prompt — the NOPASSWD sudoers entry must handle it
check "Helper systemctl rejects foreign unit" bash -c "! sudo -u $PANEL_USER sudo -n $PANEL_BIN/panel-systemctl restart evil-unit 2>/dev/null"

echo "== Summary =="
echo "  Passed: $PASS   Failed: $FAIL"
echo "  RAM: $(awk '/MemTotal/ {printf "%dMB", $2/1024}' /proc/meminfo) | Disk /: $(df -h / | awk 'NR==2 {print $4}') free | Swap: $(swapon --show --noheadings | wc -l) active"

[ "$FAIL" -eq 0 ] || { echo "VERIFICATION FAILED — review the [FAIL] items above"; exit 1; }
echo "ALL CHECKS PASSED — server ready for phase 1 (panel backend)."
