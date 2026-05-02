# SoakAtlas

https://soaktrail.com

A comprehensive guide to natural hot springs across the American West. Features 500+ mapped hot springs across 12 states, organized into 5 regional directories.

## Project Structure

- `/` - Astro website (deployed to Cloudflare Pages)
- `/src/` - Website source code
- `/public/` - Static assets and cloudflare routing config
- `/src/index.ts` - MCP server for programmatic hot spring queries (deployed to Cloudflare Workers)
- `/migrations/` - Database schemas for the 5 regional D1 databases

## Quick Start

### Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account

### Website Setup

```bash
# Install dependencies
npm install

# Develop locally
npm run dev

# Build for production
npm run build
```

The Astro site will be available at http://localhost:4321

### MCP Server Setup

The MCP server is a separate Cloudflare Worker:

```bash
# Deploy the MCP server
npm run deploy-mcp

# or use wrangler directly
wrangler deploy
```

## Deployment

### Website (Cloudflare Pages)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Create a new Pages project
3. Connect your git repository
4. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Add custom domain: `soaktrail.com`

### MCP Server (Cloudflare Workers)

The MCP server provides 5 search tools for querying hot springs:
- Location-based search (Haversine distance)
- Bounding box search
- Filter by state, access, temperature, dogs, fees
- Get spring details by slug
- List all springs in a region

```bash
# Configure D1 databases (ids in wrangler.toml)
wrangler d1 list

# Deploy
wrangler deploy

# The service will be available at: https://your-worker.workers.dev/mcp
```

## Regional Partners

- **Washington Hot Springs** - Pacific Northwest thermal pools
- **Soak Colorado** - Rocky Mountain mineral waters
- **Shasta Hot Springs** - Northern California & Southern Oregon
- **Soak the Rockies** - Idaho, Montana & Wyoming
- **Desert Soak** - Southwest desert oases

## Tech Stack

- **Frontend**: Astro 5.x, Tailwind CSS
- **Hosting**: Cloudflare Pages (Website), Cloudflare Workers (MCP)
- **Database**: Cloudflare D1 (5 regional databases)
- **Styling**: Custom color palette with copper accents

## License

All rights reserved © 2025 SoakAtlas
