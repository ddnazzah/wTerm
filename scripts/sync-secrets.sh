#!/usr/bin/env bash
#
# Push macOS signing/notarization credentials from .env into GitHub Actions
# secrets, so the release workflow can build a signed + notarized DMG.
#
# Usage:  ./scripts/sync-secrets.sh
#
# Only the known signing keys are synced. Empty values are skipped (so a
# partially-filled .env won't clobber a secret that's already set on GitHub).

set -euo pipefail

REPO="ddnazzah/wTerm"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No .env found at $ENV_FILE — copy .env.example to .env and fill it in." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) not found. Install it and run 'gh auth login' first." >&2
  exit 1
fi

KNOWN="CSC_LINK CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID"

while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip comments and blank lines.
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue
  # Split on the first '=' only; the value is taken verbatim (no trimming, so
  # base64 blobs and passwords with special characters survive intact).
  name="${line%%=*}"
  value="${line#*=}"
  name="${name//[[:space:]]/}"

  case " $KNOWN " in
    *" $name "*) ;;
    *) continue ;;
  esac

  if [[ -z "$value" ]]; then
    echo "skip  $name (empty)"
    continue
  fi

  printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
  echo "set   $name"
done < "$ENV_FILE"

echo "Done. Current secrets:"
gh secret list --repo "$REPO"
