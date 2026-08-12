#!/bin/bash
set -e

SITES="desert soakcolorados soaktherockies soakalaska mountshasthotsprings wa_hot soaktrail"
FAILED=0

for site in $SITES; do
  echo "=== Building $site ==="
  cd "sites/$site"
  if ! npm run build 2>&1; then
    echo "❌ $site build failed"
    FAILED=1
  else
    echo "✅ $site built successfully"
  fi
  cd ../..
  echo ""
done

if [ $FAILED -eq 1 ]; then
  echo "❌ One or more sites failed to build. Push blocked."
  exit 1
fi

echo "✅ All sites built successfully."
exit 0
