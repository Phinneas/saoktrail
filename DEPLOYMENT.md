# Cloudflare Deployment Guide

This guide covers deploying both the Soak Trail website and MCP server to Cloudflare.

## Prerequisites

- Cloudflare account
- Node.js 18+
- Git repository connected to GitHub/GitLab

## 1. MCP Server Deployment (Cloudflare Workers)

The MCP server should be deployed first, as the website references it.

```bash
# Install dependencies
npm install

# Login to Cloudflare
wrangler login

# Deploy the worker
wrangler deploy
```

This will deploy your MCP server to a `.workers.dev` subdomain.

### Configure D1 Databases

The MCP server uses 5 regional D1 databases:

```bash
# List existing databases
wrangler d1 list

# Each database is already configured in wrangler.toml:
# DB_DESERT  - AZ, NV, UT (92 springs)
# DB_ROCKIES - ID, MT, WY (261 springs)
# DB_COLORADO - CO (37 springs)
# DB_SHASTA - CA, OR (64 springs)
# DB_WASHINGTON - WA (46 springs)
```

Note: Database IDs are already in your wrangler.toml. If you need to recreate them, update the IDs accordingly.

### Test the MCP Server

After deployment, test your MCP endpoint:

```bash
curl -X POST https://<your-worker>.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"1.0"}}}'
```

Health check:
```bash
curl https://<your-worker>.workers.dev/health
```

## 2. Website Deployment (Cloudflare Pages)

> **Important — read before deploying the soaktrail site.**
> The soaktrail website (`sites/soaktrail/`) is a Cloudflare **Pages** project named
> **`saoktrail`** (legacy typo — do NOT "fix" it; Pages project names cannot be renamed).
> It serves `soaktrail.com` and `www.soaktrail.com`. The site is SSR (Astro + Cloudflare
> adapter); Pages uses `dist/_worker.js/` as the SSR worker automatically, so SSR routes
> like `/locator` are served.
>
> **Do NOT deploy the soaktrail site with `wrangler deploy`** — that targets the `assets`
> config in `sites/soaktrail/wrangler.jsonc` and creates a stray assets-only Worker
> (`soaktrail.buzzuw2.workers.dev`) that cannot serve SSR. It is not the production site.
>
> Direct deploy (what `deploy-all.sh` now does for the soaktrail entry):
> ```bash
> cd sites/soaktrail && npm run build
> npx wrangler pages deploy dist --project-name=saoktrail --branch=main
> ```
> The MapTiler key is read from `sites/soaktrail/.env` (`PUBLIC_MAPTILER_KEY`) at build
> time and inlined into the SSR bundle. The API worker is separate
> (`soakatlas-mcp.buzzuw2.workers.dev`); the map fetches `/springs` and
> `/spring/:slug/images` from it (override via `PUBLIC_API_URL`).

### Connect Repository

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** > **Pages**
3. Click **Create a project** > **Connect to Git**
4. Select your Git provider and authorize Cloudflare
5. Choose your Soak Trail repository

### Configure Build Settings

**Build configuration:**
- Framework preset: **Astro**
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/` (leave empty or set to `/`)
- Node.js version: 18.x or higher

**Environment variables (optional):**
```bash
NODE_VERSION=18
```

### Custom Domain

1. After deployment, go to **Custom domains** tab
2. Add `soaktrail.com` and/or `www.soaktrail.com`
3. Cloudflare will provide DNS records to add
4. Update your DNS at your registrar:
   - Add CNAME for `www` pointing to your Pages domain
   - Add A/AAA records for root domain as provided by Cloudflare

### Routes Configuration

The `_routes.json` file is already configured in `/public/_routes.json` to:
- Serve all routes through the adapter
- Exclude static assets from function invocations

This file is automatically used by Cloudflare Pages.

## 3. Environment Configuration

### Domain References

Update `astro.config.mjs` if deploying to a different domain:

```js
export default defineConfig({
  site: 'https://soaktrail.com', // Your domain here
  // ...
});
```

### MCP Endpoint References

The website references your MCP server. Currently hardcoded as:
- Production: `https://soakatlas-mcp.buzzuw2.workers.dev/mcp`

Update these in `src/pages/index.astro` if you deploy to a different worker subdomain.

## 4. Testing

### Website

Test the live site:
- Homepage loads: `https://soaktrail.com`
- All 5 regional sites are clickable
- Navigation works
- Images load

### MCP Server

Test with Claude Desktop or other MCP client:

```json
{
  "mcpServers": {
    "soakatlas": {
      "url": "https://<your-worker>.workers.dev/mcp"
    }
  }
}
```

## 5. Monitoring

### Cloudflare Dashboard

- **Pages**: View deployments, build logs, and analytics
- **Workers**: Monitor MCP server requests and errors
- **D1**: Check database query performance

### Logs

View real-time logs for your MCP server:

```bash
wrangler tail
```

## Troubleshooting

### Website Build Fails

- Ensure Node.js version is 18+ (check in Pages settings)
- Verify all dependencies are installed: `npm ci`
- Check build logs in Cloudflare dashboard

### Images Not Loading

- Check `_routes.json` excludes static assets
- Verify images are in `/public` directory

### MCP Server Errors

- Confirm D1 database bindings match `wrangler.toml`
- Check wrangler logs: `wrangler tail`
- Test with curl to isolate issues

### DNS Issues

- DNS propagation can take 24-48 hours
- Use Cloudflare's proxy (orange cloud) for best performance
- Check DNS records in Cloudflare dashboard

## Security Considerations

- Keep `wrangler.toml` in `.gitignore` if it contains sensitive IDs
- Use Cloudflare's built-in DDoS protection
- Enable rate limiting on the MCP server if needed
- Keep dependencies updated: `npm update`

## Performance Optimization

- Enable Cloudflare's Auto Minify (JS, CSS, HTML)
- Use Cloudflare's image optimization for `/public` images
- Consider Cloudflare's cache rules
- Monitor Core Web Vitals in Cloudflare dashboard
