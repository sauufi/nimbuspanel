#!/usr/bin/env bash
# 33-dkim.sh — DKIM signing via OpenDKIM (postfix milter on localhost).
# Keys/tables managed per-domain by panel-mail (gen-dkim/del-dkim).
# After generating keys in the panel, publish the shown TXT record at
# your DNS provider (together with the DMARC record suggested there).
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

ensure_pkgs opendkim opendkim-tools

CONF="/etc/opendkim.conf"
[ -f "$CONF" ] || die "/etc/opendkim.conf missing (opendkim package issue)"

# matikan direktif default yang akan kita ganti (idempoten), lalu blok terkelola
sed -i -E 's/^((Socket|KeyTable|SigningTable|ExternalIgnoreList|InternalHosts|Mode|Canonicalization|SubDomains)[[:space:]].*)/# panel: \1/' "$CONF"
sed -i '/^# BEGIN PANEL DKIM$/,/^# END PANEL DKIM$/d' "$CONF"
cat >> "$CONF" <<'EOF'
# BEGIN PANEL DKIM
Syslog          yes
Mode            sv
Canonicalization relaxed/relaxed
SubDomains      no
Socket          inet:12345@127.0.0.1
KeyTable        refile:/etc/opendkim/KeyTable
SigningTable    refile:/etc/opendkim/SigningTable
ExternalIgnoreList      refile:/etc/opendkim/TrustedHosts
InternalHosts           refile:/etc/opendkim/TrustedHosts
# END PANEL DKIM
EOF

mkdir -p /etc/opendkim/keys
touch /etc/opendkim/KeyTable /etc/opendkim/SigningTable
cat > /etc/opendkim/TrustedHosts <<'EOF'
127.0.0.1
::1
localhost
EOF
chown -R opendkim:opendkim /etc/opendkim
chmod 0644 /etc/opendkim/KeyTable /etc/opendkim/SigningTable /etc/opendkim/TrustedHosts

# postfix: daftarkan milter (blok terkelola)
sed -i '/^# BEGIN PANEL DKIM$/,/^# END PANEL DKIM$/d' /etc/postfix/main.cf
cat >> /etc/postfix/main.cf <<'EOF'
# BEGIN PANEL DKIM
smtpd_milters = inet:127.0.0.1:12345
non_smtpd_milters = inet:127.0.0.1:12345
milter_default_action = accept
# END PANEL DKIM
EOF

systemctl enable --now opendkim
systemctl restart opendkim
postfix check
systemctl restart postfix

info "DKIM OK: OpenDKIM milter on 127.0.0.1:12345 — generate keys per domain from the panel (Mail page)"
