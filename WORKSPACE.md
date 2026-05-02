# Workspace Structure

This workspace contains two separate but related projects:

## 1. SoakAtlas Website (`/`) - Cloudflare Pages

**Location**: Root directory  
**Deployment**: Cloudflare Pages (for soaktrail.com)  
**Framework**: Astro 5.x + Tailwind CSS

### Key Files
- `astro.config.mjs` - Astro configuration with Cloudflare adapter
- `package.json` - Website dependencies (Astro, Tailwind, Cloudflare adapter)
- `src/` - Website source code (pages, layouts, components)
- `public/` - Static assets + Cloudflare routing config
- `dist/` - Build output (not in git)

## 2. MCP Server (`/src/index.ts`) - Cloudflare Workers

**Location**: `/src/index.ts`  
**Deployment**: Cloudflare Workers  
**Framework**: Cloudflare Workers with D1 databases

### Key Files
- `src/index.ts` - MCP server entrypoint
- `package-mcp.json` - MCP server dependencies
- `wrangler.toml` - Worker configuration with 5 D1 database bindings

## Usage

### Website Development
```bash
npm install
npm run dev    # Start Astro dev server
npm run build  # Build for production
```

### MCP Server Deployment
```bash
wrangler deploy
or
npm run deploy:mcp
```

## Node for Cloudflare Pages

When deploying to Cloudflare Pages, ensure:
- Build command: `npm run build`
- Build output directory: `dist`
- No root directory override (use `/`)
- Node.js version: 18+

The `.gitignore` excludes `node_modules/`, `.astro/`, `dist/`, and other build artifacts from version control.
