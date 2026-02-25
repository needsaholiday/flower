#!/bin/sh
set -e

CONFIG_FILE="${CONFIG_PATH:-/config/targets.json}"
TEMPLATE="/etc/caddy/Caddyfile.template"
CADDYFILE="/etc/caddy/Caddyfile"

echo "rp-ui: Generating Caddyfile from targets config..."

if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: Config file not found at $CONFIG_FILE"
  exit 1
fi

# Generate proxy route blocks from targets.json
# Each target gets: handle /api/proxy/<name>/* { uri strip_prefix /api/proxy/<name>; reverse_proxy <url> }
PROXY_ROUTES=""

# Parse targets.json using jq
for row in $(jq -r '.[] | @base64' "$CONFIG_FILE"); do
  _jq() {
    echo "$row" | base64 -d | jq -r "${1}"
  }

  NAME=$(_jq '.name')
  URL=$(_jq '.url')

  echo "  -> Registering proxy route: /api/proxy/$NAME -> $URL"

  # Only add TLS transport config for HTTPS upstreams
  TRANSPORT_BLOCK=""
  case "$URL" in
    https://*)
      TRANSPORT_BLOCK="
			transport http {
				tls_insecure_skip_verify
			}"
      ;;
  esac

  PROXY_ROUTES="${PROXY_ROUTES}
	handle_path /api/proxy/${NAME}/* {
		reverse_proxy ${URL} {
			header_up Host {upstream_hostport}${TRANSPORT_BLOCK}
		}
	}
"
done

# Replace placeholder in template
# Use awk since sed has issues with multiline replacement
awk -v routes="$PROXY_ROUTES" '{
  if ($0 ~ /\{\{PROXY_ROUTES\}\}/) {
    print routes
  } else {
    print
  }
}' "$TEMPLATE" > "$CADDYFILE"

echo "rp-ui: Caddyfile generated with $(jq length "$CONFIG_FILE") proxy routes"
echo "---"
cat "$CADDYFILE"
echo "---"

echo "rp-ui: Starting Caddy..."
exec caddy run --config "$CADDYFILE" --adapter caddyfile
