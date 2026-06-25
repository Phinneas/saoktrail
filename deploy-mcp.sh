#!/bin/bash

# Deploy SoakAtlas MCP Server to Cloudflare Workers

echo "🌋 Deploying SoakAtlas MCP Server..."
echo "======================================"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
fi

# Check if logged in
wrangler whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "🔐 Not logged into Cloudflare. Running wrangler login..."
    wrangler login
fi

# Deploy MCP server
echo "📦 Deploying MCP server..."
npx wrangler deploy

if [ $? -eq 0 ]; then
    echo "✅ MCP server deployed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Update the MCP endpoint in src/pages/index.astro if needed"
    echo "2. Deploy the website to Cloudflare Pages"
    echo "3. Test the MCP server: curl https://<your-worker>.workers.dev/health"
else
    echo "❌ Deployment failed"
    exit 1
fi
