#!/usr/bin/env bash
# 32-mail.sh — lightweight mail stack: Postfix (SMTP, virtual maps)
# + Dovecot (IMAP, passwd-file auth) + vmail user. TLS reuses the
# panel's certificate for this hostname. Managed by panel-mail.
# NOTE v1: no DKIM/antispam yet — see README for the DNS records to set.
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

ensure_pkgs postfix dovecot-imapd

id -u vmail &>/dev/null || useradd -r -d /var/mail/vhosts -s /usr/sbin/nologin -c "virtual mail" vmail
VMAIL_UID="$(id -u vmail)"
VMAIL_GID="$(id -g vmail)"
mkdir -p /var/mail/vhosts
chown vmail:vmail /var/mail/vhosts
chmod 0750 /var/mail/vhosts

MAILHOST="$(hostname -f 2>/dev/null || hostname)"
MAIL_DIR="/etc/panel-mail"
mkdir -p "$MAIL_DIR"
chmod 0755 "$MAIL_DIR"
touch "$MAIL_DIR/domains" "$MAIL_DIR/mailboxes" "$MAIL_DIR/aliases" "$MAIL_DIR/users"
chmod 0644 "$MAIL_DIR/domains" "$MAIL_DIR/mailboxes" "$MAIL_DIR/aliases"
# users berisi HASH — dibaca worker auth dovecot (bukan root)
chown root:dovecot "$MAIL_DIR/users"
chmod 0640 "$MAIL_DIR/users"

# TLS certificate: reuse the panel's cert for this hostname; else snakeoil
TLSC="/etc/postfix/panel-tls"
mkdir -p "$TLSC"
if [ -f /etc/nginx/ssl/panel/fullchain.pem ]; then
    install -m 0644 /etc/nginx/ssl/panel/fullchain.pem "$TLSC/fullchain.pem"
    install -m 0600 /etc/nginx/ssl/panel/privkey.pem "$TLSC/privkey.pem"
elif [ -f /etc/ssl/certs/ssl-cert-snakeoil.pem ]; then
    install -m 0644 /etc/ssl/certs/ssl-cert-snakeoil.pem "$TLSC/fullchain.pem"
    install -m 0600 /etc/ssl/private/ssl-cert-snakeoil.key "$TLSC/privkey.pem"
    warn "No panel certificate found — mail TLS uses a snakeoil cert"
fi

# ---- Postfix main.cf (managed block) ----
sed -i '/^# BEGIN PANEL MAIL$/,/^# END PANEL MAIL$/d' /etc/postfix/main.cf
cat >> /etc/postfix/main.cf <<EOF
# BEGIN PANEL MAIL
myorigin = /etc/mailname
mydestination = localhost.\$myhostname, localhost
myhostname = $MAILHOST
virtual_mailbox_domains = texthash:$MAIL_DIR/domains
virtual_mailbox_maps = texthash:$MAIL_DIR/mailboxes
virtual_alias_maps = texthash:$MAIL_DIR/aliases
virtual_mailbox_base = /var/mail/vhosts
virtual_uid_maps = static:$VMAIL_UID
virtual_gid_maps = static:$VMAIL_GID
virtual_minimum_uid = 100
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_tls_cert_file = $TLSC/fullchain.pem
smtpd_tls_key_file = $TLSC/privkey.pem
smtpd_tls_security_level = may
smtpd_recipient_restrictions = permit_sasl_authenticated, permit_mynetworks, reject_unauth_destination
# END PANEL MAIL
EOF

# Enable the submission service (587, STARTTLS + SASL auth)
sed -i 's/^#submission/submission/' /etc/postfix/master.cf
echo "$MAILHOST" > /etc/mailname

# ---- Dovecot ----
sed -i 's/^!include auth-system.conf.ext/#!include auth-system.conf.ext/' /etc/dovecot/conf.d/10-auth.conf
cat > /etc/dovecot/conf.d/99-panel.conf <<EOF
# managed by panel — do not edit by hand
protocols = imap
auth_mechanisms = plain login
disable_plaintext_auth = yes
passdb {
  driver = passwd-file
  args = scheme=SHA512-CRYPT username_format=%u $MAIL_DIR/users
}
userdb {
  driver = passwd-file
  args = username_format=%u $MAIL_DIR/users
}
mail_location = maildir:/var/mail/vhosts/%d/%n/Maildir
mail_privileged_group = vmail
first_valid_uid = $VMAIL_UID
ssl = required
ssl_cert = <$TLSC/fullchain.pem
ssl_key = <$TLSC/privkey.pem
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0666
    user = postfix
    group = postfix
  }
}
EOF

# ---- Firewall ----
ufw allow 25/tcp
ufw allow 143/tcp
ufw allow 587/tcp
ufw allow 993/tcp

postfix check
systemctl enable --now postfix dovecot
systemctl restart postfix dovecot

info "Mail stack OK: Postfix + Dovecot (host $MAILHOST, ports 25/143/587/993) — managed via panel-mail"
