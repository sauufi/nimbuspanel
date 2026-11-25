# Troubleshooting

## Panel Not Accessible

### Via IP
```bash
# Check panel service
systemctl status panel

# Check if listening
ss -tlnp | grep 3444

# Check nginx
systemctl status nginx
nginx -t

# Check firewall
ufw status
```

### Via Domain (HTTPS)
```bash
# Check DNS
dig +short your-domain.com

# Check nginx vhost
ls -la /etc/nginx/sites-enabled/
cat /etc/nginx/sites-available/panel.conf

# Check SSL certificate
ls -la /etc/nginx/ssl/panel/

# Retry SSL issuance
/opt/panel/bin/panel-hostname issue-ssl your-domain.com
```

## Site Not Loading

### 502 Bad Gateway (Node.js)
```bash
# Check the app's systemd unit
systemctl status app-<id>

# Check logs
journalctl -u app-<id> -n 50

# Common causes:
# - App crashed (check logs for errors)
# - Wrong start command
# - Wrong port number
```

### 502 Bad Gateway (PHP)
```bash
# Check PHP-FPM
systemctl status php8.3-fpm

# Check pool config
cat /etc/php/8.3/fpm/pool.d/your-domain.com.conf

# Check nginx error log
tail -20 /var/www/your-domain.com/logs/error.log
```

### 403 Forbidden
```bash
# Check file permissions
ls -la /var/www/your-domain.com/htdocs/

# Fix ownership
SITE_USER="site-$(printf '%s' 'your-domain.com' | md5sum | cut -c1-8)"
chown -R $SITE_USER:$SITE_USER /var/www/your-domain.com/htdocs/
```

## Deploy Failures

### Git Clone Failed
```
Error: "git clone failed (public repo/valid path?)"
```

**For public repos:**
```bash
# Test manually on server
git clone https://github.com/user/repo.git /tmp/test
```

**For private repos:**
- Check Git Credentials: Settings → Git Credentials → Test token
- Verify token has "Contents: Read-only" permission
- Verify token has access to the specific repository

### Health Check Failed
```
Error: "HEALTH CHECK FAILED — application is not responding on port XXXXX"
```

The app built but doesn't respond on the allocated port. Check:
1. App listens on `process.env.PORT` (not hardcoded port)
2. App binds to `0.0.0.0` (not `127.0.0.1` only)
3. Check app logs: `journalctl -u app-<id> -n 30`

**Auto-rollback** kicks in — the previous release stays active.

### Build Failed (npm install)
```bash
# Check Node version
/opt/node/v22/bin/node --version

# Check disk space
df -h /

# Clear npm cache
npm cache clean --force
```

## Email Issues

### Can't Send Email (Outbound)
```bash
# Test port 25
timeout 5 bash -c 'echo QUIT | nc -w 3 gmail-smtp-in.l.google.com 25'

# If timeout → port 25 blocked by VPS provider
# Solution: Contact provider to unblock, or use SMTP relay
```

### Can't Receive Email
```bash
# Check MX record
dig MX your-domain.com

# Check Postfix
systemctl status postfix

# Check mail logs
journalctl -u postfix -n 20

# Check if port 25 is open in firewall
ufw status | grep 25
```

### DKIM Not Working
```bash
# Check if DKIM keys exist
ls -la /etc/opendkim/keys/your-domain.com/

# Check DNS record
dig TXT mail._domainkey.your-domain.com

# Regenerate: Mail page → Delete → Generate keys
```

## SSL Issues

### Certificate Expired
```bash
# Check cert expiry
openssl x509 -enddate -noout -in /etc/nginx/ssl/your-domain.com/fullchain.pem

# Manual renewal
/opt/panel/bin/panel-issue-ssl your-domain.com

# Check acme.sh cron
crontab -l | grep acme
```

### SSL Pending (Settings page)
DNS hasn't propagated yet. Wait for DNS to point to the server, then:
- Settings → **Retry SSL issuance**

## Disk Full

```bash
# Check what's using disk
du -sh /var/www/*/ /var/backups/panel/ /root/.npm/

# Quick cleanup
npm cache clean --force
rm -rf /root/panel/frontend/node_modules /root/panel/backend/node_modules
apt-get clean
journalctl --vacuum-size=20M

# Reduce backup retention
# Panel → Backups → Settings → Retention
```

## Database Issues

### Can't Connect
```bash
# Check MariaDB
systemctl status mariadb

# Test connection
mariadb -u root -e "SELECT 1;"
```

### Import Failed
- File too large (> 64MB): Use Adminer instead, or split the SQL file
- Invalid SQL syntax: Check file encoding (must be UTF-8)

## Resetting Admin Password

If you've lost the admin password and can't log in:

```bash
# Delete all users → panel shows Initial Setup on next visit
sqlite3 /opt/panel/etc/panel.db "DELETE FROM users;"
systemctl restart panel
```

## Getting Help

- **GitHub Issues**: [Report a bug](https://github.com/sauufi/nimbuspanel/issues)
- **Check logs**:
  ```bash
  # Panel logs
  journalctl -u panel -n 50

  # Provisioning log
  tail -50 /var/log/panel-provision.log

  # Nginx error log
  tail -20 /var/log/nginx/error.log
  ```
