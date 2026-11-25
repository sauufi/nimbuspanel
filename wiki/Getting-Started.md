# Getting Started

## First Run

After installation, open `http://your-server-ip` (or `https://your-domain` if you've set a hostname).

You'll see the **Initial Setup** page:

1. Enter an admin username (default: `admin`)
2. Enter a strong password (minimum 10 characters)
3. Click **Create Admin**

You're now logged in to NimbusPanel.

## Setting Your Panel Hostname & SSL

By default, the panel is accessible via IP. To use a domain:

1. Point your domain's **A record** to the server IP
2. Go to **Settings → Panel Hostname & SSL**
3. Enter your hostname (e.g. `panel.example.com`)
4. Click **Save & Apply**

NimbusPanel will automatically:
- Create an nginx vhost for the domain
- Issue a Let's Encrypt SSL certificate
- Set up HTTPS redirect

> **Note:** DNS must already point to your server before issuing SSL. If DNS isn't ready, the hostname is saved but SSL shows "pending" — click "Retry SSL" when DNS is configured.

## Adding Your First Site

1. Go to **Sites** → **+ Add Site**
2. Enter your domain (DNS must point to the server)
3. Choose site type:
   - **PHP** — for WordPress, Laravel, static sites
   - **Node.js** — for Express, Next.js, APIs
4. For PHP: select version (8.2/8.3) and web server (nginx or Apache)
5. Click **Create Site**

Your site is now live with a default welcome page.

### Web Server Choice (PHP Sites)

| Mode | Best For | .htaccess |
|---|---|---|
| **nginx** (default) | Performance, WordPress permalinks | ❌ Not read (use URL Rules converter) |
| **Apache** | Sites with existing .htaccess rules | ✅ Fully compatible |

WordPress permalinks work in both modes. Only choose Apache if you have custom .htaccess rules.

## Issuing SSL for a Site

1. Open the site's detail page
2. Click **Issue SSL (Let's Encrypt)**
3. Wait ~10 seconds — SSL is issued and HTTPS redirect is enabled

## Uploading Files

### Via File Manager (Browser)
1. Open site detail → **Files** tab
2. Browse, edit, upload, download files directly
3. Click any text file to open the built-in editor

### Via SFTP
```bash
# Connect using the site's Linux user (auto-generated)
sftp site-xxxxxxxx@your-server-ip
# Upload to /var/www/yourdomain.com/htdocs/
```

## Installing WordPress (One-Click)

1. Create a PHP site (docroot must be empty)
2. Open site detail → **Overview** tab
3. Click **Install WordPress**
4. Database is created automatically
5. Click "Complete setup" → WordPress installation wizard

## Dashboard Overview

The dashboard shows:
- **Memory / Disk / Uptime / Services** — real-time server stats (refreshes every 15s)
- **Services** — all running services (nginx, PHP-FPM, MariaDB, Postfix, etc.)
- **Root Terminal** — SSH terminal in your browser

## Next Steps

- [[Managing Sites]] — PHP, Node.js, SSL, file manager
- [[Node.js Deployment]] — Git-based auto-deploy pipeline
- [[Email & Webmail]] — Set up email for your domains
- [[Backups]] — Configure scheduled backups
- [[Security]] — Enable 2FA, change passwords
