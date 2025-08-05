#!/system/bin/sh
# update_cookie.sh - Update Roblox cookie in SQLite database
# Usage: update_cookie.sh [cookie_db_path] [cookie_file_path]

COOKIE_DB="$1"
COOKIE_FILE="$2"

if [ -z "$COOKIE_DB" ]; then
  COOKIE_DB="/data/data/com.roblox.client/app_webview/Default/Cookies"
fi

if [ -z "$COOKIE_FILE" ]; then
  COOKIE_FILE="/data/local/tmp/cookie.b64"
fi

if [ ! -f "$COOKIE_FILE" ]; then
  echo "Cookie file not found: $COOKIE_FILE"
  exit 1
fi

COOKIE=$(cat "$COOKIE_FILE" | base64 -d)

if [ -z "$COOKIE" ]; then
  echo "Failed to read cookie from $COOKIE_FILE"
  exit 1
fi

ESCAPED_COOKIE=$(echo "$COOKIE" | sed "s/'/''/g")
SQL="UPDATE cookies SET value='$ESCAPED_COOKIE' WHERE host_key='.roblox.com' AND name='.ROBLOSECURITY';"

echo "Updating cookie in database: $COOKIE_DB"
echo "Using cookie file: $COOKIE_FILE"

echo "$SQL" | sqlite3 "$COOKIE_DB"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "Cookie update successful"
else
  echo "Cookie update failed with exit code $EXIT_CODE"
fi

exit $EXIT_CODE