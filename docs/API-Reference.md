# API Reference

All API endpoints require authentication via `panel_session` cookie (obtained from login).

## Authentication

### POST /api/auth/login
```json
{
  "username": "admin",
  "password": "yourpassword",
  "totp": "123456"  // required if 2FA enabled
}
```
Response: `{ "ok": true }` + `Set-Cookie: panel_session=...`

### POST /api/auth/logout
Response: `{ "ok": true }` (clears session)

### POST /api/auth/setup
First-run only — creates the admin account.
```json
{
  "username": "admin",
  "password": "yourpassword"
}
```

### POST /api/auth/password
Change panel password.
```json
{
  "current": "oldpassword",
  "next": "newpassword"
}
```

## Sites

### GET /api/sites
List all sites.

### POST /api/sites
Create a new site.
```json
{
  "domain": "example.com",
  "type": "php",
  "phpVersion": "8.3",
  "webServer": "nginx"  // or "apache"
}
```

### GET /api/sites/:id
Get site details (runtime, SSL status, service status).

### DELETE /api/sites/:id?purge=1
Delete site. `purge=1` destroys data permanently.

### POST /api/sites/:id/ssl
Issue Let's Encrypt certificate + enable HTTPS.

### POST /api/sites/:id/wordpress
Install WordPress (one-click).

### POST /api/sites/:id/adminer
Install Adminer database UI.

## Node.js Deployment

### PUT /api/sites/:id/settings
Update deploy settings.
```json
{
  "repoUrl": "https://github.com/user/app.git",
  "branch": "main",
  "nodeVersion": "22",
  "buildCmd": "npm run build",
  "startCmd": "node dist/index.js"
}
```

### POST /api/sites/:id/deploy
Trigger a deploy (sync — may take 1-3 minutes).

### POST /api/sites/:id/rollback
Rollback to previous release.

### GET/PUT /api/sites/:id/env
Read/write environment variables (.env file).

### POST /api/sites/:id/webhook-secret
Generate/rotate webhook secret.
Response: `{ "ok": true, "secret": "..." }`

### POST /api/hooks/:siteId (PUBLIC)
Webhook endpoint — verified by HMAC signature (GitHub) or token (GitLab).

## File Manager

### GET /api/sites/:id/fs?path=
List directory contents.

### GET /api/sites/:id/fs/read?path=
Read file content (text files ≤ 2MB).

### GET /api/sites/:id/fs/download?path=
Download file (binary safe).

### PUT /api/sites/:id/fs/write
Write file content.
```json
{
  "path": "htdocs/index.php",
  "content": "<?php echo 'hello';"
}
```

### POST /api/sites/:id/fs/upload
Upload file (base64 encoded).
```json
{
  "path": "htdocs/image.png",
  "contentBase64": "iVBORw0KGgo..."
}
```

### POST /api/sites/:id/fs/mkdir
Create directory.

### POST /api/sites/:id/fs/rename
Rename/move file or folder.
```json
{
  "from": "old-name.txt",
  "to": "new-name.txt"
}
```

### DELETE /api/sites/:id/fs?path=
Delete file/folder (recursive).

## Databases

### GET /api/db
List all databases with size and table count.

### POST /api/db
Create database + user.
```json
{
  "siteId": 1,
  "name": "myapp_db"
}
```

### GET /api/db/:id/dump
Download SQL dump.

### POST /api/db/:id/import
Import SQL (body = raw SQL text).

### POST /api/db/:id/password
Rotate database user password.

### DELETE /api/db/:id
Delete database permanently.

## Backups

### GET /api/backups
List backup files.

### GET /api/backups/settings
Read backup configuration.

### PUT /api/backups/settings
Update backup settings.
```json
{
  "enabled": true,
  "time": "02:30",
  "retention": 14,
  "scope": "all"
}
```

### POST /api/backups/run
Trigger manual backup.
```json
{
  "scope": "all"
}
```

### GET /api/backups/download?dir=&file=
Download backup file.

### POST /api/backups/restore
Restore from backup.
```json
{
  "dir": "20261125-023001",
  "file": "db-myapp.sql.gz"
}
```

## Mail

### GET /api/mail
List mail domains, mailboxes, aliases, DKIM status.

### POST /api/mail/domain
Add mail domain.

### POST /api/mail/box
Create mailbox.
```json
{
  "domain": "example.com",
  "localpart": "info"
}
```

### POST /api/mail/alias
Create alias/forward.
```json
{
  "domain": "example.com",
  "alias": "noreply",
  "target": "admin@example.com"
}
```

### POST /api/mail/dkim
Generate DKIM keys for a domain.

### POST /api/mail/webmail
Install SnappyMail webmail.
```json
{
  "target": "panel"
}
```

## Cron Jobs

### GET /api/sites/:id/cron
List cron jobs for a site.

### POST /api/sites/:id/cron
Add cron job.
```json
{
  "schedule": "*/5 * * * *",
  "command": "php /var/www/example.com/htdocs/cron.php"
}
```

### POST /api/sites/:id/cron/toggle
Enable/disable a cron job.

### DELETE /api/sites/:id/cron?jobId=
Delete a cron job.

## System

### GET /api/system/metrics
RAM, disk, load, uptime, hostname.

### GET /api/system/services
Status of all running services (nginx, PHP-FPM, MariaDB, etc.).

## Panel Settings

### GET /api/panel-host
Get panel hostname/SSL status.

### POST /api/panel-host
Set panel hostname.
```json
{
  "hostname": "panel.example.com"
}
```

### POST /api/panel-host/ssl
Retry SSL issuance.

### GET/PUT/DELETE /api/git-token
Manage GitHub token for private repos.

### GET/PUT /api/notifications
Telegram notification settings.

### POST /api/notifications/test
Send test Telegram message.

## Security

### GET /api/auth/totp
Get 2FA status.

### POST /api/auth/totp/setup
Generate TOTP secret (not yet active).

### POST /api/auth/totp/enable
Activate 2FA with verification code.
```json
{
  "code": "123456"
}
```

### POST /api/auth/totp/disable
Disable 2FA (requires password).
```json
{
  "password": "yourpassword"
}
```
