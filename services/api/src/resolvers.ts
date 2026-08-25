export type Bindings = {
  DB: any;
  ENVIRONMENT: string;
  AI: any;
  WOLLYCMS?: any;
  WOLLY_CMS_API?: string;
  GEMINI_API_KEY?: string;
  ADMIN_SECRET?: string;
  UGC_BUCKET?: R2Bucket;
  TURNSTILE_SECRET_KEY?: string;
};

// Helper to parse JSON fields
export const parseJSON = (value: string | any, defaultValue: any): any => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
  return value != null ? value : defaultValue;
};

// Field resolvers for JSON parsing
export const fieldResolvers = {
  Spring: {
    chemistry: (parent: any) => parseJSON(parent.chemistry, []),
    chemistry_details: (parent: any) => parseJSON(parent.chemistry_details, {}),
  },
  BlogPost: {
    tags: (parent: any) => parseJSON(parent.tags, []),
    featured_springs: (parent: any) => parseJSON(parent.featured_springs, []),
  },
  Query: {},
};

// Root resolver with database queries
export const createRootResolver = (env: Bindings) => ({
  springs: async (args: any) => {
    let sql = 'SELECT * FROM springs';
    const params: any[] = [];

    if (args.state) {
      sql += ' WHERE state = ?';
      params.push(args.state);
    }

    if (args.access_type) {
      sql += args.state ? ' AND access_type = ?' : ' WHERE access_type = ?';
      params.push(args.access_type);
    }

    sql += ' LIMIT ? OFFSET ?';
    params.push(args.limit, args.offset);

    const results = await env.DB.prepare(sql).bind(...params).all();
    return results.results;
  },

  spring: async (args: { slug: string }) => {
    const result = await env
      .DB.prepare('SELECT * FROM springs WHERE slug = ?')
      .bind(args.slug)
      .first();
    return result;
  },

  blogPosts: async (args: any) => {
    const sql = 'SELECT * FROM blog_posts ORDER BY published_at DESC LIMIT ? OFFSET ?';
    const results = await env.DB.prepare(sql).bind(args.limit, args.offset).all();
    return results.results;
  },

  blogPost: async (args: { slug: string }) => {
    const result = await env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ?').bind(args.slug).first();
    return result;
  },
});
