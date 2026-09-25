#!/bin/bash
# =============================================================================
# Nextcloud Before-Starting Hook: Apply Custom Configuration
# =============================================================================
# This hook runs on every container start (before Apache launches) and copies
# custom Nextcloud config overrides from the build-time staging directory into
# the live config directory.
#
# Why a hook instead of a direct COPY in the Dockerfile?
#   The official entrypoint may overwrite /var/www/html/config/ during
#   installation or upgrades.  By applying our overrides in before-starting,
#   they always take effect regardless of what the base entrypoint did.
#
# Permission handling:
#   Older images ran this hook as root; since 32.0.x the official entrypoint
#   runs hooks as www-data. As root it copies and chowns. As www-data every
#   file it copies is already www-data's, so there is nothing to chown -- and
#   it must NEVER reach for sudo: freddy's Docker daemon sets
#   no-new-privileges for every container, which makes sudo fail outright.
#   On 2026-09-25 the 32.0.6 -> 32.0.15 rebuild hit exactly that fallback,
#   the hook exited 1 on every start, and Nextcloud crash-looped. A copy the
#   non-root path cannot make fails loudly instead of trying to escalate.
#
# Source: /usr/src/nextcloud-custom-config/*.config.php  (baked into image)
# Target: /var/www/html/config/                          (live config dir)
# =============================================================================

set -e

CONFIG_SRC="/usr/src/nextcloud-custom-config"
CONFIG_DST="/var/www/html/config"

echo "────────────────────────────────────────────────"
echo "📝 Applying custom Nextcloud configuration..."
echo "────────────────────────────────────────────────"

CURRENT_UID="$(id -u)"
CURRENT_USER="$(id -un 2>/dev/null || echo "uid-${CURRENT_UID}")"
echo "  ℹ️  Running as: ${CURRENT_USER} (UID ${CURRENT_UID})"

# Ensure the target config directory exists
if [ "${CURRENT_UID}" -eq 0 ]; then
    mkdir -p "$CONFIG_DST"
else
    mkdir -p "$CONFIG_DST"
fi

# copy_file src dst — copy a single file, handling permission issues
copy_file() {
    local src="$1"
    local dst="$2"

    if [ "${CURRENT_UID}" -eq 0 ]; then
        # Running as root — straightforward copy
        cp -f "$src" "$dst"
    else
        # Running as www-data. A refusal here means the target belongs to
        # root from an old root-run hook: say so, rather than escalating.
        if ! cp -f "$src" "$dst"; then
            echo "  ❌ cannot write $dst as $(id -un); fix its ownership from the host:" >&2
            echo "     docker exec -u 0 nextcloud chown www-data:www-data $dst" >&2
            exit 1
        fi
    fi
}

# fix_permissions — ensure www-data owns the config directory and files
fix_permissions() {
    if [ "${CURRENT_UID}" -eq 0 ]; then
        chown -R www-data:www-data "$CONFIG_DST"
        chmod 770 "$CONFIG_DST"
        chmod 660 "$CONFIG_DST"/*.config.php 2>/dev/null || true
    else
        # Already www-data's (it just wrote them); tighten modes where it can.
        chmod 770 "$CONFIG_DST" 2>/dev/null || true
        chmod 660 "$CONFIG_DST"/*.config.php 2>/dev/null || true
    fi
}

if [ -d "$CONFIG_SRC" ] && [ "$(ls -A "$CONFIG_SRC"/*.config.php 2>/dev/null)" ]; then
    for src_file in "$CONFIG_SRC"/*.config.php; do
        filename="$(basename "$src_file")"
        dst_file="$CONFIG_DST/$filename"

        copy_file "$src_file" "$dst_file"
        echo "  ✅ Applied: $filename"
    done

    fix_permissions
    echo "  ✅ Permissions set (www-data:www-data)"
else
    echo "  ⚠️  No custom config files found in $CONFIG_SRC"
fi

echo "────────────────────────────────────────────────"
echo "✅ Custom configuration applied"
echo "────────────────────────────────────────────────"
