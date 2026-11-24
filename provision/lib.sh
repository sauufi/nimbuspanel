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
    OS_PRETTY="${PRETTY_NAME:-$OS_ID $OS_VERSION}"

    # --- Supported OS matrix ---
    # Ubuntu: 22.04 (jammy), 24.04 (noble), 24.10 (oracular), 25.04 (plucky), future LTS
    # Debian: 12 (bookworm), 13 (trixie), 14 (forky)
    # For future releases we try the codename against sury.org; if unavailable,
    # we fall back to the closest known LTS codename.

    case "$OS_ID" in
        ubuntu)
            OS_MAJOR=$(echo "$OS_VERSION" | cut -d. -f1)
            if [ "$OS_MAJOR" -lt 22 ]; then
                die "Ubuntu $OS_VERSION is not supported (minimum: 22.04). Upgrade your OS first."
            fi
            ;;
        debian)
            OS_MAJOR="$OS_VERSION"
            if [ "$OS_MAJOR" -lt 12 ]; then
                die "Debian $OS_VERSION is not supported (minimum: 12/bookworm). Upgrade your OS first."
            fi
            ;;
        *)
            warn "OS '$OS_PRETTY' is not officially supported."
            warn "Supported: Ubuntu 22.04+ and Debian 12+"
            warn "Attempting to continue — report issues if something breaks."
            # Try to detect Debian/Ubuntu derivative
            if command -v apt-get >/dev/null 2>&1; then
                OS_MAJOR=22
            else
                die "This system doesn't use apt/dpkg — NimbusPanel requires a Debian-based OS."
            fi
            ;;
    esac

    # --- Resolve sury.org codename ---
    # sury.org provides PHP packages for specific codenames.
    # If the current codename isn't available (too new), fall back to the
    # most recent available one.
    SURY_CODENAMES="bookworm trixie bullseye noble jammy"
    if echo "$SURY_CODENAMES" | grep -qw "$OS_CODENAME"; then
        PHP_REPO_CODENAME="$OS_CODENAME"
    else
        # Fall back: try trixie first (Debian) or noble (Ubuntu)
        if [ "$OS_ID" = "debian" ]; then
            PHP_REPO_CODENAME="trixie"
        else
            PHP_REPO_CODENAME="noble"
        fi
        warn "sury.org may not have packages for '$OS_CODENAME' — using '$PHP_REPO_CODENAME' as fallback"
        warn "If PHP installation fails, check https://packages.sury.org/php/dists/ for available codenames"
    fi

    info "OS detected: $OS_PRETTY (codename: $OS_CODENAME, sury repo: $PHP_REPO_CODENAME)"
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
