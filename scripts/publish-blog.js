#!/usr/bin/env node
/**
 * Blog Publishing Script
 * 
 * Reads the blog-content-queue.json, generates content for the next post,
 * and publishes it to WollyCMS via their API.
 * 
 * Usage:
 *   node scripts/publish-blog.js [topic_index]
 * 
 * If topic_index is not provided, publishes the next unpublished topic in queue.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = path.join(__dirname, '../site/data/blog-content-queue.json');

// WollyCMS configuration
const WOLLY_API_URL = process.env.WOLLY_API_URL || '';
const WOLLY_API_KEY = process.env.WOLLY_API_KEY || '';
const SITE_SLUG = 'soaktrail';

async function loadQueue() {
  const data = await fs.readFile(QUEUE_PATH, 'utf-8');
  return JSON.parse(data);
}

async function saveQueue(queue) {
  await fs.writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

async function publishToWolly(post) {
  if (!WOLLY_API_URL || !WOLLY_API_KEY) {
    console.error('WOLLY_API_URL and WOLLY_API_KEY environment variables must be set');
    process.exit(1);
  }

  const response = await fetch(`${WOLLY_API_URL}/api/pages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WOLLY_API_KEY}`,
    },
    body: JSON.stringify({
      type: 'blog',
      slug: post.slug,
      title: post.title,
      status: 'published',
      site: SITE_SLUG,
      fields: {
        excerpt: post.excerpt,
        content: post.content,
        tags: post.tags,
        site: SITE_SLUG,
      },
      meta: {
        published_at: new Date().toISOString(),
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to publish to WollyCMS: ${response.status} ${error}`);
  }

  return await response.json();
}

async function generateContent(topic) {
  // For now, create a structured post from the outline
  // In production, this could call an LLM API to generate full content
  const sections = topic.structure.map(section => {
    const heading = section.replace(/^.*?\s*[:\-]\s*/, '').trim();
    return `## ${heading}\n\n(Content for this section will be generated.)\n`;
  }).join('\n');

  return `# ${topic.title}\n\n${topic.excerpt}\n\n${sections}`;
}

async function main() {
  const topicIndex = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
  
  const queue = await loadQueue();
  
  // Find the next unpublished topic
  let topic;
  let topicIdx;
  
  if (topicIndex !== undefined) {
    topicIdx = topicIndex;
    topic = queue.topics[topicIndex];
  } else {
    topicIdx = queue.topics.findIndex(t => !t._meta.published);
    topic = topicIdx >= 0 ? queue.topics[topicIdx] : null;
  }
  
  if (!topic) {
    console.log('No unpublished topics found in queue.');
    return;
  }
  
  console.log(`Publishing: ${topic.title} (topic #${topicIdx})`);
  
  // Generate content
  const content = await generateContent(topic);
  
  // Publish to WollyCMS
  const post = {
    slug: topic.slug,
    title: topic.title,
    excerpt: topic.excerpt,
    content,
    tags: topic.tags,
  };
  
  try {
    const result = await publishToWolly(post);
    console.log(`Published successfully: ${result.data?.slug || topic.slug}`);
    
    // Mark as published in queue
    queue.topics[topicIdx]._meta.published = true;
    queue.topics[topicIdx]._meta.published_at = new Date().toISOString();
    await saveQueue(queue);
    
  } catch (error) {
    console.error('Failed to publish:', error.message);
    process.exit(1);
  }
}

main();
