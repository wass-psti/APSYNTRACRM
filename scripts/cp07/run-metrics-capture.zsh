#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

read -s "SUPABASE_METRICS_SECRET_KEY?Enter the existing Supabase Secret API key: "
echo
if [[ -z "$SUPABASE_METRICS_SECRET_KEY" ]]; then
  echo "No key entered. No metrics request was made."
  exit 2
fi

export SUPABASE_METRICS_SECRET_KEY
trap 'unset SUPABASE_METRICS_SECRET_KEY' EXIT
cd "$REPO_ROOT"
node scripts/cp06/capture-metrics.mjs
