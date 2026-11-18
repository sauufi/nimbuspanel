# ============================================================
# config.sh — konfigurasi provisioning (boleh diedit sebelum run)
# Dipakai oleh semua script di steps/ dan verify.sh
# ============================================================

PANEL_USER="panel"
PANEL_HOME="/opt/panel"
PANEL_BIN="/opt/panel/bin"
WWW_ROOT="/var/www"
BACKUP_DIR="/var/backups/panel"
SSL_DIR_ROOT="/etc/nginx/ssl"
ACME_HOME="/etc/panel/acme"

# Versi PHP yang dipasang (repo menyediakan 5.6 s/d 8.4, tergantung OS).
# Override sekali jalan lewat flag: --php "8.1 8.3"
PHP_VERSIONS=(8.2 8.3)
PHP_EXTENSIONS=(cli fpm common curl gd mbstring mysql xml zip intl bcmath opcache sqlite3)

# Major version Node.js; patch terbaru diambil otomatis dari nodejs.org,
# dipasang ke /opt/node/v<major> (tanpa menyentuh PATH global).
# Override lewat flag: --node "20 22"
NODE_VERSIONS=(22)
NODE_ROOT="/opt/node"

# Email akun Let's Encrypt untuk acme.sh (opsional, bisa juga --email).
PANEL_ACME_EMAIL=""
