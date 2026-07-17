import { describe, it, expect, vi } from 'vitest';
import { parseJSON, createRootResolver } from '../resolvers';

describe('API Resolvers', () => {
  describe('parseJSON', () => {
    it('should parse valid JSON strings', () => {
      const result = parseJSON('["hot", "mineral"]', []);
      expect(result).toEqual(['hot', 'mineral']);
    });

    it('should return default value for invalid JSON', () => {
      const result = parseJSON('invalid json', []);
      expect(result).toEqual([]);
    });

    it('should return value if it is already an object', () => {
      const obj = { temperature: 100, ph: 7.5 };
      const result = parseJSON(obj, {});
      expect(result).toEqual(obj);
    });

    it('should return default value for null', () => {
      const result = parseJSON(null, { default: 'value' });
      expect(result).toEqual({ default: 'value' });
    });
  });

  describe('createRootResolver', () => {
    const mockEnv = {
      DB: {
        prepare: vi.fn(),
      },
      ENVIRONMENT: 'production',
    };

    it('should create resolver with spring query', () => {
      const resolver = createRootResolver(mockEnv);
      expect(resolver).toHaveProperty('springs');
      expect(typeof resolver.springs).toBe('function');
    });

    it('should create resolver with single spring query', () => {
      const resolver = createRootResolver(mockEnv);
      expect(resolver).toHaveProperty('spring');
      expect(typeof resolver.spring).toBe('function');
    });

    it('should create resolver with blog posts query', () => {
      const resolver = createRootResolver(mockEnv);
      expect(resolver).toHaveProperty('blogPosts');
      expect(typeof resolver.blogPosts).toBe('function');
    });

    it('should create resolver with single blog post query', () => {
      const resolver = createRootResolver(mockEnv);
      expect(resolver).toHaveProperty('blogPost');
      expect(typeof resolver.blogPost).toBe('function');
    });
  });

  describe('Springs Query', () => {
    const mockEnv = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn(async () => ({ results: [] })),
          })),
          first: vi.fn(),
        })),
      },
      ENVIRONMENT: 'production',
    };

    it('should build SQL query without filters', async () => {
      const resolver = createRootResolver(mockEnv);
      await resolver.springs({ limit: 20, offset: 0 });

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        'SELECT * FROM springs LIMIT ? OFFSET ?'
      );
    });

    it('should build SQL query with state filter', async () => {
      const resolver = createRootResolver(mockEnv);
      await resolver.springs({ limit: 20, offset: 0, state: 'idaho' });

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        'SELECT * FROM springs WHERE state = ? LIMIT ? OFFSET ?'
      );
    });

    it('should build SQL query with access type filter', async () => {
      const resolver = createRootResolver(mockEnv);
      await resolver.springs({ limit: 20, offset: 0, access_type: 'paved' });

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        'SELECT * FROM springs WHERE access_type = ? LIMIT ? OFFSET ?'
      );
    });

    it('should build SQL query with both filters', async () => {
      const resolver = createRootResolver(mockEnv);
      await resolver.springs({ limit: 20, offset: 0, state: 'idaho', access_type: 'paved' });

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        'SELECT * FROM springs WHERE state = ? AND access_type = ? LIMIT ? OFFSET ?'
      );
    });
  });

  describe('Blog Posts Query', () => {
    const mockEnv = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn(async () => ({ results: [] })),
          })),
          first: vi.fn(),
        })),
      },
      ENVIRONMENT: 'production',
    };

    it('should query blog posts with correct SQL', async () => {
      const resolver = createRootResolver(mockEnv);
      await resolver.blogPosts({ limit: 20, offset: 0 });

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        'SELECT * FROM blog_posts ORDER BY published_at DESC LIMIT ? OFFSET ?'
      );
    });
  });

  describe('Single Spring Query', () => {
    const mockEnv = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({ id: '1', name: 'Test' })),
          })),
          all: vi.fn(),
        })),
      },
      ENVIRONMENT: 'production',
    };

    it('should query single spring by slug', async () => {
      const resolver = createRootResolver(mockEnv);
      await resolver.spring({ slug: 'test-spring' });

      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        'SELECT * FROM springs WHERE slug = ?'
      );
    });
  });
});
