#!/usr/bin/env bash
# lib.sh — helper umum (di-source, jangan dieksekusi langsung)

set -o pipefail

LOG_FILE="/var/log/panel-provision.log"

_log() { printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$2" | tee -a "$LOG_FILE"; }
info() { _log INFO  "$*"; }
warn() { _log WARN  "$*"; }
err()  { _log ERROR "$*"; }
die()  { err "$*"; exit 1; }

require_root() {
    [ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash provision.sh"
}

detect_os() {
    . /etc/os-release
    OS_ID="${ID:-}"
    OS_VERSION="${VERSION_ID:-}"
    OS_CODENAME="${VERSION_CODENAME:-}"
    case "$OS_ID:$OS_VERSION" in
        ubuntu:24.04 | ubuntu:22.04 | debian:12) ;;
        *) warn "OS $OS_ID $OS_VERSION is untested (Ubuntu 24.04 or Debian 12 recommended)" ;;
    esac
}
detect_os

pkg_installed() { dpkg -s "$1" &>/dev/null; }

# Install packages when missing; apt index is only updated when something is missing
ensure_pkgs() {
    local missing=()
    local p
    for p in "$@"; do
        pkg_installed "$p" || missing+=("$p")
    done
    if ((${#missing[@]})); then
        info "Installing packages: ${missing[*]}"
        apt-get -o Acquire::Retries=3 update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}"
    fi
}
