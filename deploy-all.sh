#!/bin/bash
set -e

# Build and deploy all 7 sites to Cloudflare Workers.
# Usage: ./deploy-all.sh
# Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars (or wrangler login).

SITES="desert soakcolorados soaktherockies soakalaska mountshasthotsprings wa_hot soaktrail"
FAILED=0

for site in $SITES; do
  echo "=== Building $site ==="
  cd "sites/$site"
  if ! npm run build 2>&1; then
    echo "❌ $site build failed"
    FAILED=1
    cd ../..
    continue
  fi
  echo "✅ $site built"

  # Soaktrail is SSR — exclude _worker.js from static asset upload
  if [ "$site" = "soaktrail" ]; then
    echo "_worker.js" > dist/.assetsignore
  fi

  echo "📦 Deploying $site..."
  if ! npx wrangler deploy 2>&1; then
    echo "❌ $site deploy failed"
    FAILED=1
  else
    echo "✅ $site deployed"
  fi
  cd ../..
  echo ""
done

if [ $FAILED -eq 1 ]; then
  echo "❌ One or more sites failed to build or deploy."
  exit 1
fi

echo "✅ All sites built and deployed successfully."
exit 0
