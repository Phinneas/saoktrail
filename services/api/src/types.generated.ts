// ERP: Types generated from D1 schema - DO NOT EDIT
// Run: wrangler d1 execute DB --remote --command "SELECT * FROM springs LIMIT 1" | generate-types

/// <reference types="@cloudflare/workers-types" />

import type { D1Database } from '@cloudflare/workers-types';

export interface Spring {
  id: number;
  name: string;
  slug: string;
  lat: number;
  lon: number;
  elevation_ft: number;
  temperature_f: number;
  access_type: 'paved' | 'gravel' | '4wd' | 'hike';
  development: string;
  chemistry: string[];
  state: 'idaho' | 'montana' | 'wyoming';
  fs_road?: string;
  description?: string;
  image_url?: string;
  source_temperature_c?: number;
  chemistry_source?: string;
  chemistry_sampled_on?: string;
  chemistry_level: 'enhanced' | 'basic';
  chemistry_details: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  body: string;
  excerpt?: string;
  tags: string[];
  featured_springs: string[];
  published_at?: string;
  author: string;
  created_at: string;
  updated_at: string;
}

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}
