#!/usr/bin/env bash
# CP-HULY-SB07: self-locating acceptance launcher for macOS bash.
# Invocation works from any directory; does not print or retain user tokens.
set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$HERE/.." && pwd)"
PKG="$ROOT/packages/huly-supabase"
HELPER="$PKG/scripts/sb07-discover-scope.mjs"

if [[ ! -f "$PKG/package.json" || ! -f "$HELPER" || ! -f "$PKG/scripts/sb07-signed-acceptance.mjs" ]]; then
  echo "BLOCKED: Incomplete APSYNTRA CRM checkout: $ROOT" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "BLOCKED: Node.js is required." >&2
  exit 2
fi

MODE="${1:---full}"
case "$MODE" in
  --full) export SB07_TARGET=host ;;
  --supabase-only) export SB07_TARGET=supabase ;;
  *) echo "Usage: bash <repo>/bin/apsyntra-sb07-accept.sh [--full|--supabase-only]" >&2; exit 2 ;;
esac

CONFIG="$(node "$HELPER" --config)"
if [[ "$CONFIG" != *$'\n'* ]]; then echo "BLOCKED: Public client configuration missing." >&2; exit 2; fi
export SUPABASE_URL="${CONFIG%%$'\n'*}"
export SUPABASE_PUBLISHABLE_KEY="${CONFIG#*$'\n'}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  printf 'Paste the access token copied from APSYNTRA CRM (input hidden): ' >&2
  IFS= read -r -s SUPABASE_ACCESS_TOKEN
  printf '\n' >&2
  export SUPABASE_ACCESS_TOKEN
fi
if [[ -z "$SUPABASE_ACCESS_TOKEN" ]]; then
  echo "BLOCKED: No access token entered." >&2
  exit 2
fi

if [[ "${SB07_WRITE_APPROVED:-}" == "yes" || "${SB07_NONPRODUCTION_BOARD:-}" == "yes" ]]; then
  if [[ "${SB07_WRITE_APPROVED:-}" != "yes" || "${SB07_NONPRODUCTION_BOARD:-}" != "yes" ]]; then
    echo "BLOCKED: Both write-confirmation flags must be yes." >&2
    exit 2
  fi
  if [[ "$MODE" != "--full" || -z "${HULY_WORKSPACE_ID:-}" || -z "${HULY_BOARD_ID:-}" ]]; then
    echo "BLOCKED: Writes require --full plus explicit nonproduction board/workspace UUIDs." >&2
    exit 2
  fi
fi

SCOPE="$(node "$HELPER" --select)"
if [[ "$SCOPE" != *" "* ]]; then echo "BLOCKED: Failed to establish board scope." >&2; exit 2; fi
export HULY_WORKSPACE_ID="${SCOPE%% *}"
export HULY_BOARD_ID="${SCOPE#* }"
echo "========== SB07 SIGNED ACCEPTANCE =========="
echo "Mode: $MODE"
echo "Project: $PKG"
echo "Access token: [REDACTED]"
node "$PKG/scripts/sb07-signed-acceptance.mjs"
