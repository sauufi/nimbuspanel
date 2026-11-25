# Managing Sites

## PHP Sites

### Web Server Modes

| Mode | When to Use | .htaccess |
|---|---|---|
| **nginx** (default) | Performance, WordPress, Laravel | ❌ Not read — use URL Rules converter |
| **Apache** | Existing sites with .htaccess rules | ✅ Fully compatible |

WordPress and Laravel permalinks work in **both** modes (nginx handles via `try_files`).

### .htaccess → nginx Converter

For nginx-mode PHP sites with custom .htaccess rules:

1. Site detail → **URL Rules** tab
2. Paste your .htaccess content in the "Convert" box
3. Click **Convert** — rules are translated to nginx syntax
4. Review warnings (some directives can't be converted)
5. Click **Save Rules** — validated with `nginx -t` before applying

**Converted:** RewriteRule, Redirect, Files/FilesMatch deny, ErrorDocument, Header set

**Warned:** php_value, AuthType, ExpiresByType (manual intervention needed)

### Manual Rule Builder

Also in **URL Rules** tab — add rules without .htaccess:

| Rule Type | Example |
|---|---|
| 301 redirect | `/old-page` → `/new-page` |
| 302 redirect | `/temp` → `/landing` |
| Internal rewrite | `^/api/(.*)$` → `/index.php?route=$1` |
| Deny exact file | `/secret.txt` |
| Deny regex pattern | `\.(env|log|sql)$` |

### WordPress One-Click Install

Site detail → **Overview** tab → **Install WordPress**:

1. Downloads latest WordPress from wordpress.org
2. Creates MariaDB database + user with strong password
3. Generates wp-config.php with secure salts
4. Sets correct file permissions
5. Shows database credentials + link to WordPress setup wizard

**Requirements:** Empty docroot (no existing files except index.html)

### Adminer (Database UI)

Site detail → **Overview** tab → **Install Adminer** — one-click database management tool installed at a random URL (e.g. `/adminer-x7f3k2.php`). Delete the file when done.

## Node.js Sites

See [[Node.js Deployment]] for the full pipeline documentation.

## SSL Management

### Issue SSL
Site detail → **Overview** → **Issue SSL (Let's Encrypt)**:
- Certificate is issued via webroot (no downtime)
- HTTPS redirect (301) is automatically configured
- Renewal is automatic via acme.sh cron

### Requirements
- DNS A record must point to the server
- Site must be accessible via HTTP on port 80

## File Manager

Site detail → **Files** tab:

| Action | How |
|---|---|
| Browse | Click folders, breadcrumb navigation |
| Edit file | Click any text file → built-in editor opens |
| Create file | "+ New file" button |
| Create folder | "+ New folder" button |
| Upload | "Upload" button (≤10MB per file) |
| Download | ↓ icon next to file |
| Rename | ✎ icon |
| Delete | ✕ icon (recursive for folders) |

**Security:** All operations run as the site's Linux user. Paths are validated — no directory traversal possible.

## Cron Jobs

Site detail → **Cron** tab:

- Add scheduled tasks with preset schedules (every 5 min, hourly, daily, etc.) or custom cron expressions
- Jobs run as the site's Linux user
- Pause/resume with one click
- Delete with confirmation

Example: `php /var/www/yourdomain.com/htdocs/cron.php` every 5 minutes

## Terminal (SSH)

Site detail → **Terminal** tab — opens an SSH session as the site's Linux user, in your browser.

- Full bash shell
- Starting directory: site's home directory
- Uses xterm.js for terminal emulation

The **Dashboard** also has a **Root Terminal** for full server access.

## Deleting a Site

Site detail → **Overview** → **Delete site** section:

1. Check "Permanently destroy site data" (optional)
2. Type the domain name to confirm
3. Click **Delete Site**

Without "destroy data": site folder is moved to `/var/www/<domain>.removed-<timestamp>/` (recoverable).

With "destroy data": everything is deleted permanently.

**What's removed:** nginx vhost, PHP-FPM pool (or Node systemd unit), Linux user, site directory, DNS entry in panel database.
