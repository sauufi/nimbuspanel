<div align="center">

# ☁️ NimbusPanel

**The lightweight hosting control panel for PHP & Node.js**

Native performance. Zero Docker overhead. Runs on 1GB RAM.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-24.04-E95420)](https://ubuntu.com)
[![Node](https://img.shields.io/badge/Node.js-22+-339933)](https://nodejs.org)

</div>

---

## ✨ Features

| | |
|---|---|
| 🌐 **PHP + Node.js** | Multi-version PHP (7.4–8.4) with per-site FPM pools. Node.js with git deploy pipeline. |
| 🔐 **Free SSL** | Let's Encrypt certificates issued and renewed automatically. |
| 📁 **File Manager** | Browse, edit, upload files directly from the browser. |
| ✉️ **Email + Webmail** | Postfix + Dovecot + SnappyMail. DKIM signing built-in. |
| 🔄 **Git Auto-Deploy** | Push to deploy with webhook. Auto-rollback on failure. |
| 📦 **Smart Backups** | Scheduled, configurable scope, retention policy, one-click restore. |
| 🗄 **Database** | MariaDB management with import/export. One-click Adminer. |
| 📜 **.htaccess Mode** | Per-site nginx or Apache. Built-in .htaccess converter. |
| 🛡 **Security** | Per-site Linux users, TOTP 2FA, sudo whitelist, audit logging. |

## 🚀 Quick Start

```bash
# 1. Provision your server (fresh Ubuntu 24.04 / Debian 12)
scp -r nimbuspanel root@your-server:/root/
ssh root@your-server
cd nimbuspanel && bash provision/provision.sh

# 2. Deploy the panel
bash scripts/deploy.sh

# 3. Open http://your-server-ip — done!
```

## 📊 Minimum Requirements

| | Minimum | Recommended |
|---|---|---|
| RAM | 848 MB | 2 GB |
| Disk | 8 GB | 20 GB |
| CPU | 1 core | 2 cores |
| OS | Ubuntu 24.04 / Debian 12 | Ubuntu 24.04 |

## 🏗 Architecture

```
┌─────────────────────────────────────────────┐
│  NimbusPanel (React + Fastify + SQLite)     │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Sites   │ │ Database │ │ Mail        │  │
│  │ Files   │ │ Backups  │ │ Security    │  │
│  └────┬────┘ └────┬─────┘ └──────┬──────┘  │
│       │           │              │          │
│  ┌────▼───────────▼──────────────▼──────┐  │
│  │    Sudo Whitelist Root Helpers       │  │
│  └────────────────┬─────────────────────┘  │
└───────────────────┼────────────────────────┘
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
  nginx    PHP-FPM pools    systemd units
  (vhosts) (per-site)       (Node apps)
```

## 📁 Project Structure

```
nimbuspanel/
├── provision/          # Server provisioning scripts
│   ├── provision.sh    # Main entry point (idempotent)
│   ├── verify.sh       # Post-install verification
│   ├── steps/          # Modular provisioning steps
│   └── bin/            # Root helper scripts (17 helpers)
├── backend/            # Fastify + TypeScript API server
│   └── src/
│       ├── auth.ts     # Session, scrypt, TOTP 2FA
│       ├── sites.ts    # Site CRUD + deploy pipeline
│       ├── files.ts    # File manager API
│       ├── mail.ts     # Email management API
│       ├── backups.ts  # Backup scheduling API
│       └── htaccess.ts # .htaccess → nginx converter
├── frontend/           # React + Vite + Tailwind SPA
│   └── src/pages/      # Dashboard, Sites, Database, etc.
├── landing/            # Static landing page
├── scripts/deploy.sh   # Build & deploy script
└── infra/              # nginx configs, examples
```

## 🔐 Security Model

- Panel backend runs as unprivileged user `panel` (not root)
- Root operations only via **whitelisted helper scripts** in `/opt/panel/bin/`
- Per-site Linux users with nologin shells
- Passwords hashed with scrypt (no external dependencies)
- Optional TOTP two-factor authentication
- All actions logged to audit trail

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Made with ❤️ in Indonesia 🇮🇩
</div>
