# Installation

## Requirements

| | Minimum | Recommended |
|---|---|---|
| RAM | 848 MB | 2 GB |
| Disk | 8 GB | 20 GB |
| CPU | 1 core | 2 cores |
| OS | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 LTS |

**Supported OS:** Ubuntu 22.04/24.04 (LTS), Ubuntu 24.10+, Debian 12/13+. Future releases work via automatic sury.org codename fallback.

## Method 1: One-Line Install (Recommended)

```bash
curl -sSL https://nimbus.sauu.fi/install.sh | bash
```

The installer will:
1. Check system requirements (RAM, disk, OS)
2. Download NimbusPanel source
3. Provision the server (nginx, PHP, Node.js, MariaDB, mail, SSL, firewall)
4. Build and deploy the panel
5. Display your panel URL

**After install:** Open `http://your-server-ip` in your browser.

## Method 2: Manual Install

```bash
# 1. Clone the repository
git clone https://github.com/sauufi/nimbuspanel.git
scp -r nimbuspanel root@your-server:/root/

# 2. SSH into server
ssh root@your-server

# 3. Provision
cd nimbuspanel
bash provision/provision.sh --tz Asia/Jakarta

# 4. Verify
bash provision/verify.sh
# Expected: ALL CHECKS PASSED

# 5. Deploy panel
bash scripts/deploy.sh
```

## Method 3: From Release Tarball

```bash
curl -fsSL https://nimbus.sauu.fi/nimbuspanel-v1.0.tar.gz -o /tmp/np.tar.gz
cd /tmp && tar xzf np.tar.gz
cd panel
bash provision/provision.sh
bash scripts/deploy.sh
```

## Provisioning Options

| Flag | Default | Description |
|---|---|---|
| `--tz <zone>` | UTC | Timezone (e.g. `Asia/Jakarta`) |
| `--email <addr>` | none | Let's Encrypt account email |
| `--php "8.2 8.3"` | 8.2 8.3 | PHP versions to install |
| `--node "22"` | 22 | Node.js major version |
| `--swap auto` | auto | Swap size (auto/none/2G/4G) |
| `--harden-ssh` | off | Disable SSH password login |

## What Gets Installed

```
┌─────────────────────────────────────────────────────┐
│ Web: nginx (reverse proxy + vhosts per site)        │
│ PHP: PHP-FPM 8.2+8.3 (per-site pools, multi-version)│
│ Node.js: v22 (in /opt/node, per-site systemd units) │
│ Database: MariaDB (unix socket auth)                │
│ Mail: Postfix + Dovecot + OpenDKIM + SnappyMail     │
│ SSL: acme.sh (Let's Encrypt, auto-renewal)          │
│ Security: UFW + fail2ban + per-site Linux users     │
│ Panel: Fastify + React (NimbusPanel UI)             │
└─────────────────────────────────────────────────────┘
```

## Post-Install Checklist

- [ ] Open `http://your-server-ip` → create admin account
- [ ] Go to **Settings → Panel Hostname & SSL** → set your domain
- [ ] Verify HTTPS works (`https://your-domain`)
- [ ] Go to **Security → Panel Password** → change from default
- [ ] (Optional) Enable 2FA in **Security**
- [ ] (Optional) Set up backups in **Backups**
- [ ] (Optional) Configure Telegram notifications in **Settings**
