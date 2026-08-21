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

  echo "📦 Deploying $site..."
  if [ "$site" = "soaktrail" ]; then
    # Soaktrail is a Cloudflare Pages project (named "saoktrail" — legacy typo),
    # NOT a Worker. Pages uses dist/_worker.js as the SSR worker automatically,
    # so SSR routes like /locator are served. Do NOT use `wrangler deploy` here —
    # that creates a stray assets-only Worker that can't serve SSR.
    if ! npx wrangler pages deploy dist --project-name=saoktrail --branch=main 2>&1; then
      echo "❌ $site deploy failed"
      FAILED=1
    else
      echo "✅ $site deployed"
    fi
  else
    if ! npx wrangler deploy 2>&1; then
      echo "❌ $site deploy failed"
      FAILED=1
    else
      echo "✅ $site deployed"
    fi
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
