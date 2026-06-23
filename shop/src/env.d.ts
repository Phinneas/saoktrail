/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  // D1 database
  DB: D1Database;
  // R2 bucket
  ASSETS: R2Bucket;
  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  // Gelato
  GELATO_API_KEY: string;
  GELATO_PRODUCT_UID_12X18: string;
  GELATO_PRODUCT_UID_18X24: string;
  GELATO_PRODUCT_UID_24X36: string;
  // Render service
  RENDER_SERVICE_URL: string;
  RENDER_SERVICE_SECRET: string;
  // Public URLs (vars, not secrets)
  R2_PUBLIC_URL: string;
  SOAKATLAS_MCP_URL: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
