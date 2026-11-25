# Security

## Panel Password

**Security** page → **Panel Password**:

1. Enter current password
2. Enter new password (minimum 10 characters)
3. Repeat new password
4. Click **Change Password**

> **Important:** Change the default password immediately after installation.

## Two-Factor Authentication (TOTP)

**Security** page → **Two-Factor Authentication**:

### Enabling 2FA

1. Click **Enable 2FA**
2. Scan the QR code with your authenticator app:
   - Google Authenticator (Android/iOS)
   - Aegis (Android)
   - 1Password
   - Authy
3. Enter the 6-digit code from the app
4. Click **Activate 2FA**

You can also manually enter the secret key if you can't scan the QR.

### Logging in with 2FA

1. Enter username + password
2. A 6-digit code field appears
3. Enter the current code from your authenticator app
4. Click **Sign In**

### Disabling 2FA

1. **Security** page → enter panel password
2. Click **Disable 2FA**

## Security Model

### Panel Architecture

```
Browser → HTTPS → nginx (reverse proxy) → Panel Backend (127.0.0.1:3444)
                                                    ↓
                                          sudo whitelist (root helpers)
                                                    ↓
                                          System operations
```

- Panel backend runs as **unprivileged user** `panel` (not root)
- Root operations only via **whitelisted helper scripts** in `/opt/panel/bin/`
- Each helper validates its own input (strict regex, no shell injection)
- Panel backend only listens on `127.0.0.1` — not exposed to internet

### Per-Site Isolation

Each site gets:
- **Dedicated Linux user** (nologin shell by default, no password)
- **Own PHP-FPM pool** (processes run as site user)
- **Own nginx vhost** (can't access other sites' files)
- **Own systemd unit** (Node.js apps)

One compromised site cannot access other sites' files or the panel database.

### SSL/TLS

- Let's Encrypt certificates issued via webroot (no downtime)
- Automatic renewal via acme.sh cron
- TLS 1.2/1.3 only (TLS 1.0/1.1 disabled)
- HSTS not enabled by default (can be added via URL Rules)

### Firewall (UFW)

Only these ports are open:

| Port | Service |
|---|---|
| 22 | SSH |
| 80 | HTTP (Let's Encrypt + redirect) |
| 443 | HTTPS |
| 25 | SMTP (mail) |
| 143 | IMAP (STARTTLS) |
| 587 | SMTP submission |
| 993 | IMAPS |

### Brute Force Protection

- **Panel login:** 5 failed attempts → rate-limited for 1 minute
- **SSH:** fail2ban (blocks IP after repeated failures)
- **TOTP:** 6-digit code with ±30s window

### File Security

- Site files owned by site user (not www-data or root)
- `wp-config.php` set to 0640 (only site user + group can read)
- `.env` files set to 0600 (only site user)
- Directory traversal blocked in file manager (strict path validation)
- Backup files validated before restore (no path injection)

## SSH Terminal Security

The browser terminal uses SSH with the panel's own ed25519 key:
- Root terminal: key stored in `/root/.ssh/authorized_keys`
- Site terminal: key stored in site's `.ssh/authorized_keys`
- Key never leaves the server
- All terminal sessions are logged (audit trail)

## Audit Trail

All panel actions are logged:

```sql
SELECT * FROM audit_log ORDER BY id DESC LIMIT 20;
```

Logged events include: login (success/failure), site create/delete, SSL issue, deploy, file operations, database operations, backup settings changes.

## Recommended Hardening

After installation:

1. ✅ Change panel password (Security → Panel Password)
2. ✅ Enable 2FA (Security → Two-Factor Authentication)
3. ✅ Set panel hostname + SSL (Settings → Panel Hostname & SSL)
4. ✅ Disable SSH password login: `bash provision/provision.sh --harden-ssh`
5. ✅ Configure backups (Backups → Automatic Backups)
6. ✅ Set up Telegram notifications (Settings → Notifications)
7. ✅ Review open ports: `ufw status`
8. ✅ Check fail2ban: `fail2ban-client status sshd`
