# Home

Welcome to the **NimbusPanel** wiki — the lightweight hosting control panel for PHP & Node.js.

## Quick Navigation

| Page | Description |
|---|---|
| [[Installation]] | Install on a fresh Ubuntu/Debian server (one-line or manual) |
| [[Getting Started]] | First steps after installation — create admin, set hostname, add your first site |
| [[Managing Sites]] | PHP sites (nginx/Apache), Node.js apps, SSL, file manager |
| [[Node.js Deployment]] | Git-based deploy pipeline, webhooks, environment variables, rollback |
| [[Database Management]] | Create/import/export MariaDB databases, Adminer |
| [[Email & Webmail]] | Mail domains, mailboxes, DKIM, SnappyMail webmail |
| [[Backups]] | Scheduled backups, scopes, retention, restore |
| [[Security]] | 2FA, password management, SSH terminal, security model |
| [[Cron Jobs]] | Scheduled tasks per site |
| [[Git Credentials]] | Private repo access via GitHub token |
| [[Troubleshooting]] | Common issues and solutions |
| [[API Reference]] | REST API endpoints for programmatic access |

## What is NimbusPanel?

NimbusPanel is an open-source, self-hosted control panel designed for:

- **Developers** who want to deploy PHP and Node.js apps on their own VPS
- **Small teams** that need multiple sites without cPanel licensing costs
- **Performance** — native nginx + PHP-FPM + systemd (no Docker overhead)

### Key Stats

| | |
|---|---|
| Minimum RAM | 848 MB |
| Minimum Disk | 8 GB |
| Setup Time | < 5 minutes |
| Docker Required | No |
| License | MIT |

## Supported Operating Systems

| OS | Version | Status |
|---|---|---|
| Ubuntu | 22.04 LTS+ | ✅ Tested |
| Ubuntu | 24.04 LTS | ✅ Tested |
| Ubuntu | 24.10+ | ⚠️ Auto-fallback |
| Debian | 12 (bookworm)+ | ✅ Tested |
| Debian | 13 (trixie)+ | ⚠️ Auto-detected |

## Quick Install

```bash
curl -sSL https://nimbus.sauu.fi/install.sh | bash
```

## Community

- **GitHub**: [sauufi/nimbuspanel](https://github.com/sauufi/nimbuspanel)
- **Issues**: [Report a bug](https://github.com/sauufi/nimbuspanel/issues)
- **Landing page**: [nimbus.sauu.fi](https://nimbus.sauu.fi)
