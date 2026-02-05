#!/bin/bash
# Google OAuth Simple Flow
# Run this to authenticate with Google

echo "🔐 Google OAuth Setup"
echo ""

# Check for required env vars
if [ -z "$GOOGLE_CLIENT_ID" ]; then
  echo "❌ GOOGLE_CLIENT_ID is required!"
  echo ""
  echo "Setup instructions:"
  echo "  1. Go to https://console.cloud.google.com/apis/credentials"
  echo "  2. Create OAuth 2.0 Client ID (Web application)"
  echo "  3. Add this redirect URI: http://localhost:8432/callback"
  echo "  4. Copy the Client ID and Client Secret"
  echo ""
  echo "Then run:"
  echo "  GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx ./scripts/google-oauth.sh"
  exit 1
fi

# Optional: Client Secret (not always needed for public clients)
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
GOOGLE_SCOPES="${GOOGLE_SCOPES:-openid email profile}"

echo "Client ID: ${GOOGLE_CLIENT_ID:0:15}..."
echo "Scopes: ${GOOGLE_SCOPES}"
echo ""

cd "$(dirname "$0")/.." || exit 1

# Run the auth script
GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
GOOGLE_SCOPES="$GOOGLE_SCOPES" \
bun run scripts/google-oauth-simple.ts
