#!/usr/bin/env bash
# 95-post.sh — timezone, swap untuk VPS RAM kecil, hardening SSH (opsional)
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

# --- Timezone ---
if [ -n "$PANEL_TZ" ]; then
    timedatectl set-timezone "$PANEL_TZ"
    info "Timezone set to $PANEL_TZ"
fi

# --- Swap ---
# auto: pasang 2G hanya jika RAM < 2GB dan belum ada swap
TOTAL_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
HAS_SWAP="$(swapon --show | grep -c . || true)"

if [ "$PANEL_SWAP" = "auto" ]; then
    if [ "$TOTAL_MB" -lt 2048 ] && [ "$HAS_SWAP" -eq 0 ]; then
        PANEL_SWAP="2G"
    else
        PANEL_SWAP="none"
    fi
fi

if [ "$PANEL_SWAP" != "none" ] && [ "$HAS_SWAP" -eq 0 ] && ! grep -q '^/swapfile' /etc/fstab; then
    if fallocate -l "$PANEL_SWAP" /swapfile 2>/dev/null; then
        chmod 0600 /swapfile
        mkswap /swapfile >/dev/null
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        info "Swap $PANEL_SWAP enabled (fstab persistent)"
    else
        warn "Failed to create swapfile (fallocate) — skipped"
    fi
fi

# --- Hardening SSH (opsional, flag --harden-ssh) ---
if [ "$PANEL_HARDEN_SSH" = "1" ]; then
    if [ ! -d /etc/ssh/sshd_config.d ]; then
        warn "OpenSSH without sshd_config.d — SSH hardening skipped"
    elif [ -s /root/.ssh/authorized_keys ] || ls /home/*/.ssh/authorized_keys >/dev/null 2>&1; then
        cat > /etc/ssh/sshd_config.d/99-panel-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
        sshd -t && systemctl reload ssh
        info "SSH: password login DISABLED (SSH keys only)"
    else
        warn "No SSH key found on the server — SSH hardening SKIPPED (so you do not lock yourself out)"
    fi
fi
