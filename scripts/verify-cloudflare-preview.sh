#!/usr/bin/env bash
# Read-only static response verification against the checked-out release.
set -euo pipefail
base="${1:?Supply local CI or hosted preview origin}"
case "$base" in
  http://127.0.0.1:8791|https://apsyntracrm-preview.watchdog-521.workers.dev) ;;
  *) echo 'Unexpected preview origin' >&2; exit 1 ;;
esac
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
request() {
  curl --silent --show-error --connect-timeout 8 --max-time 25 "$@"
}
same_asset() {
  local url="$1" file="$2" expected="$3" actual
  actual="$(request -o "$temp/body" -w '%{http_code}' "$base$url")"
  test "$actual" = "$expected" || { echo "FAIL $url: expected $expected, received $actual" >&2; exit 1; }
  cmp "$file" "$temp/body" || { echo "FAIL $url: response differs from checkout" >&2; exit 1; }
  echo "PASS $expected $url byte-for-byte"
}
test "$(request -o /dev/null -w '%{http_code}' "$base/")" = 302
test "$(request -o /dev/null -w '%{redirect_url}' "$base/")" = "$base/APSYNTRACRM/"
same_asset /APSYNTRACRM/ index.html 200
same_asset /APSYNTRACRM/frontend/app.js frontend/app.js 200
same_asset /APSYNTRACRM/frontend/startup-guard.js frontend/startup-guard.js 200
same_asset /APSYNTRACRM/frontend/apsyntra-styles.bundle.css frontend/apsyntra-styles.bundle.css 200
same_asset /APSYNTRACRM/frontend/vendor/supabase-auth.js frontend/vendor/supabase-auth.js 200
same_asset /APSYNTRACRM/frontend/vendor/frt-pdf-engine.js frontend/vendor/frt-pdf-engine.js 200
same_asset /APSYNTRACRM/paseo/ paseo/index.html 200
same_asset /APSYNTRACRM/paseo/courts paseo/404.html 404
same_asset /APSYNTRACRM/paseo/pages-redirect.js paseo/pages-redirect.js 200
same_asset /APSYNTRACRM/paseo/pages-restore.js paseo/pages-restore.js 200
test "$(request -o /dev/null -w '%{http_code}' "$base/APSYNTRACRM/frontend/tests/service-reliability.test.mjs")" = 404
test "$(request -o /dev/null -w '%{http_code}' "$base/APSYNTRACRM/supabase/config.toml")" = 404
echo 'PASS read-only static preview smoke; authenticated functionality requires separate acceptance.'
