#!/usr/bin/env bash
# 50-node.sh — runtime Node.js resmi (tarball) di /opt/node/v<major>
# Tidak menyentuh PATH global; panel fase 1 menulis path absolut ke unit systemd
# (mis. ExecStart=/opt/node/v22/bin/node dist/index.js).
set -euo pipefail
STEP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$STEP_ROOT/config.sh"
. "$STEP_ROOT/lib.sh"

# shellcheck disable=SC2206
NODE_LIST=(${PANEL_NODE:-${NODE_VERSIONS[*]}})

# Fallback when nodejs.org is unreachable / jq fails to parse
declare -A FALLBACK=([22]="v22.11.0" [20]="v20.18.0" [18]="v18.20.4")

node_arch() {
    case "$(uname -m)" in
        x86_64) echo "x64" ;;
        aarch64 | arm64) echo "arm64" ;;
        *) return 1 ;;
    esac
}

for ver in "${NODE_LIST[@]}"; do
    TARGET="$NODE_ROOT/v$ver"
    ARCH="$(node_arch)" || die "Architecture $(uname -m) not supported by official Node builds"

    if [ -x "$TARGET/bin/node" ]; then
        info "Node v$ver already present ($("$TARGET/bin/node" --version)), skipping"
        continue
    fi

    LATEST="$(curl -fsSL --max-time 20 https://nodejs.org/dist/index.json \
        | jq -r --arg p "v$ver." '[.[] | select(.version | startswith($p))][0].version // empty' 2>/dev/null || true)"
    [ -n "${LATEST:-}" ] || LATEST="${FALLBACK[$ver]:-}"
    [ -n "$LATEST" ] || die "No patch version known for Node major $ver (and no fallback)"

    URL="https://nodejs.org/dist/$LATEST/node-$LATEST-linux-$ARCH.tar.xz"
    info "Installing Node $LATEST ($ARCH) → $TARGET"
    mkdir -p "$NODE_ROOT"
    curl -fsSL "$URL" | tar -xJ -C "$NODE_ROOT"
    rm -rf "$TARGET"
    mv "$NODE_ROOT/node-$LATEST-linux-$ARCH" "$TARGET"
    "$TARGET/bin/node" --version >/dev/null   # sanity check binary jalan
    info "Node $("$TARGET/bin/node" --version) installed at $TARGET"
done
