// api/lib/pexels.js - Pexels API client for blog post images

export class PexelsClient {
  constructor(apiKey) {
    this.apiKey = apiKey || '';
    this.baseUrl = 'https://api.pexels.com/v1';
  }

  async searchPhotos(query, perPage = 5) {
    if (!this.apiKey) return null;

    const params = new URLSearchParams({
      query,
      per_page: String(perPage),
      orientation: 'landscape',
    });

    const response = await fetch(`${this.baseUrl}/search?${params}`, {
      headers: { Authorization: this.apiKey },
    });

    if (!response.ok) {
      console.error(`Pexels API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.photos || data.photos.length === 0) return null;

    return data.photos.map((p) => ({
      url: p.src.landscape,
      alt: p.alt || query,
      photographer: p.photographer,
      photographerUrl: p.photographer_url,
      originalUrl: p.url,
      width: p.width,
      height: p.height,
    }));
  }

  async getBestImage(query) {
    const results = await this.searchPhotos(query);
    if (!results || results.length === 0) return null;

    const best = results[0];
    return {
      imageUrl: best.url,
      alt: best.alt,
      credit: `Photo by <a href="${best.photographerUrl}">${best.photographer}</a> via <a href="https://www.pexels.com">Pexels</a>`,
      creditMarkdown: `*Photo by [${best.photographer}](${best.photographerUrl}) via [Pexels](https://www.pexels.com)*`,
      originalUrl: best.originalUrl,
    };
  }
}
