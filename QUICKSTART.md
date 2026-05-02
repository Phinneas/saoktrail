# SoakAtlas Quick Start Guide

## 🚀 Deploy to Cloudflare Pages (Website)

### 1. Push to GitHub/GitLab

```bash
git remote add origin https://github.com/YOUR_USERNAME/soakatlas.git
git branch -M main
git push -u origin main
```

### 2. Set Up Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. **Workers & Pages** → **Pages** → **Create a project**
3. Connect your Git repository
4. Configure build settings:
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: (leave empty)
5. Click **Save and Deploy**

### 3. Add Custom Domain

1. After deployment, go to **Custom domains**
2. Add `soaktrail.com` and `www.soaktrail.com`
3. Update your DNS records as instructed

## 🌍 Deploy MCP Server (API)

### Option 1: Automated Script

```bash
./deploy-mcp.sh
```

### Option 2: Manual

```bash
# Install dependencies
npm install

# Login (if not already)
npx wrangler login

# Deploy
npx wrangler deploy
```

### Option 3: Using wrangler.toml

```bash
wrangler deploy --name soakatlas-mcp
```

## 📊 Data Management

The MCP server uses 5 D1 databases (pre-configured in `wrangler.toml`):

| Database | States | Springs |
|----------|--------|---------|
| desert-soak-db | AZ, NV, UT | 92 |
| soaktherockies-springs-db | ID, MT, WY | 261 |
| soakcolorado-springs-db | CO | 37 |
| shastahotsprings-db | CA, OR | 64 |
| washingtonhotsprings-db | WA | 46 |

**Total: 500+ hot springs across 12 states**

## ✅ Verification

### Website
- Visit: `https://soaktrail.com`
- Check all 5 regional sections load
- Verify MCP API section shows correct endpoint

### MCP Server
```bash
# Health check
curl https://YOUR_WORKER.workers.dev/health

# Test query
curl -X POST https://YOUR_WORKER.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_springs_near_location","arguments":{"lat":39.7392,"lng":-104.9903,"max_distance_miles":50}}}'
```

## 📁 Project Structure

```
SoakAtlas/
├── src/                    # Website source (Astro)
│   ├── pages/
│   └── layouts/
├── public/                 # Static assets
├── dist/                   # Build output (gitignored)
├── migrations/             # Database schemas
├── MCP server files:
│   ├── package-mcp.json   # MCP dependencies
│   └── wrangler.toml      # Worker config
└── Deployment files:
    ├── README.md
    ├── DEPLOYMENT.md
    ├── QUICKSTART.md
    └── WORKSPACE.md
```

## 🔄 Development Workflow

### Make Changes

```bash
# Edit website
git checkout -b feature/my-feature
# make changes to src/ files
npm run dev  # test locally

# Edit MCP server
# make changes to src/index.ts
wrangler dev   # test locally
```

### Deploy

```bash
# MCP server first
./deploy-mcp.sh

# Website (auto-deploys via Git push)
git add . && git commit -m "..." && git push
```

## 🆘 Troubleshooting

### Website Won't Build

- Ensure Node.js 18+ in Pages settings
- Check `/public/_routes.json` exists
- Verify `astro.config.mjs` is valid

### MCP Server Errors

- Confirm `wrangler.toml` database IDs are correct
- Check `wrangler d1 list` for databases
- Run `wrangler tail` to see live logs

### Images Not Loading

- Verify images in `/public/` directory
- Check `_routes.json` excludes asset URLs

## 📞 Support

- Cloudflare Docs: https://developers.cloudflare.com
- Astro Docs: https://astro.build
- MCP Spec: https://modelcontextprotocol.io

---

**Ready to deploy?** Start with the MCP server, then the website!
