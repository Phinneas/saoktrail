// api/lib/minimax.js - Minimax API client for blog generation

function stripThinkingBlock(content) {
  const lastTitleIdx = content.lastIndexOf('TITLE:');
  if (lastTitleIdx >= 0) {
    return content.substring(lastTitleIdx);
  }
  content = content.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');
  return content;
}

export function parseBlogOutput(raw) {
  let title = '';
  let excerpt = '';
  let imagePrompt = '';
  let body = raw;

  const titleMatch = raw.match(/^TITLE:\s*(.+?)\s*$/m);
  if (titleMatch) title = titleMatch[1].trim();

  const excerptMatch = raw.match(/^EXCERPT:\s*(.+?)\s*$/m);
  if (excerptMatch) excerpt = excerptMatch[1].trim();

  const imageMatch = raw.match(/^IMAGE_PROMPT:\s*(.+?)\s*$/m);
  if (imageMatch) imagePrompt = imageMatch[1].trim();

  const bodyIdx = raw.indexOf('BODY:');
  if (bodyIdx >= 0) body = raw.substring(bodyIdx + 5).trim();
  body = body.replace(/^(TITLE:|EXCERPT:|IMAGE_PROMPT:|BODY:)\s*.*$/gm, '').trim();

  return { title, excerpt, imagePrompt, body };
}

// Convert markdown to TipTap JSON doc format that WollyCMS uses for rich text blocks.
// This makes posts editable in WollyCMS's WYSIWYG block editor instead of raw text fields.
export function markdownToTipTap(md) {
  const content = [];
  const lines = md.split('\n');
  let i = 0;

  function parseInline(text) {
    const nodes = [];
    // Process bold, italic, links, and plain text
    let remaining = text;
    while (remaining.length > 0) {
      // Bold + italic ***text***
      let m = remaining.match(/^\*\*\*(.+?)\*\*\*/);
      if (m) { nodes.push({ type: 'text', marks: [{ type: 'bold' }, { type: 'italic' }], text: m[1] }); remaining = remaining.substring(m[0].length); continue; }
      // Bold **text**
      m = remaining.match(/^\*\*(.+?)\*\*/);
      if (m) { nodes.push({ type: 'text', marks: [{ type: 'bold' }], text: m[1] }); remaining = remaining.substring(m[0].length); continue; }
      // Italic *text*
      m = remaining.match(/^\*(.+?)\*/);
      if (m) { nodes.push({ type: 'text', marks: [{ type: 'italic' }], text: m[1] }); remaining = remaining.substring(m[0].length); continue; }
      // Link [text](url)
      m = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (m) {
        nodes.push({ type: 'text', marks: [{ type: 'link', attrs: { href: m[2], target: '_blank' } }], text: m[1] });
        remaining = remaining.substring(m[0].length); continue;
      }
      // Plain text — take up to next special char or end
      m = remaining.match(/^[^*\[]+/);
      if (m) {
        nodes.push({ type: 'text', text: m[0] });
        remaining = remaining.substring(m[0].length);
      } else {
        // Safety: skip one char if nothing matched
        nodes.push({ type: 'text', text: remaining[0] });
        remaining = remaining.substring(1);
      }
    }
    return nodes.length > 0 ? nodes : [{ type: 'text', text: '' }];
  }

  function collectParagraphLines() {
    const paraLines = [];
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line === '' || line.startsWith('## ') || line.startsWith('### ') || line.startsWith('> ')) break;
      paraLines.push(line);
      i++;
    }
    return paraLines;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (line === '') { i++; continue; }

    // H2 heading
    if (line.startsWith('## ')) {
      const text = line.replace(/^##+ /, '');
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: parseInline(text),
      });
      i++; continue;
    }

    // H3 heading
    if (line.startsWith('### ')) {
      const text = line.replace(/^###+ /, '');
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: parseInline(text),
      });
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().replace(/^> /, ''));
        i++;
      }
      content.push({
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: parseInline(quoteLines.join(' ')),
        }],
      });
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-heading lines
    const paraLines = collectParagraphLines();
    if (paraLines.length > 0) {
      content.push({
        type: 'paragraph',
        content: parseInline(paraLines.join(' ')),
      });
      continue;
    }

    // Fallback — skip unrecognized line
    i++;
  }

  return {
    type: 'doc',
    content,
  };
}

// Generate a blog post image using Cloudflare Workers AI (Flux model)
// Returns the R2 public URL of the stored image, or null on failure.
export async function generateBlogImage(aiBinding, r2Binding, imagePrompt, slug) {
  if (!aiBinding || !r2Binding) return null;

  const prompt = `Professional travel photography: ${imagePrompt}. Golden hour lighting, natural hot springs in desert landscape, warm earth tones, no people, editorial quality.`;

  try {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', '1024');
    form.append('height', '768');

    const resp = await aiBinding.run('@cf/black-forest-labs/flux-2-klein-9b', {
      multipart: {
        body: form,
        contentType: 'multipart/form-data',
      },
    });

    if (!resp || !resp.image) {
      console.error('Image generation returned no image data');
      return null;
    }

    // Decode base64 to binary
    const binary = Uint8Array.from(atob(resp.image), c => c.charCodeAt(0));
    const key = `blog/${slug}.png`;

    await r2Binding.put(key, binary, {
      httpMetadata: { contentType: 'image/png' },
      customMetadata: { slug, prompt: imagePrompt },
    });

    // Return the R2 public URL (requires R2 public bucket or custom domain)
    // For now, use the Worker's own /api/images/:key endpoint
    return `/api/images/${key}`;
  } catch (err) {
    console.error('Image generation failed:', err);
    return null;
  }
}

export class MinimaxClient {
  constructor(apiKey, groupId) {
    this.apiKey = apiKey || '';
    this.baseUrl = 'https://api.minimax.io/v1/text/chatcompletion_v2';
    this.model = 'MiniMax-M2.7';
  }

  async chat(messages) {
    if (!this.apiKey) {
      throw new Error('MINIMAX_API_KEY not configured');
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Minimax API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    if (data.base_resp && data.base_resp.status_code !== 0) {
      throw new Error(`Minimax API error: ${data.base_resp.status_code} - ${data.base_resp.status_msg}`);
    }

    if (data.choices && data.choices[0]) {
      let content = data.choices[0].message?.content || data.choices[0]?.text || '';
      content = stripThinkingBlock(content);
      return content;
    }
    if (data.text) {
      return stripThinkingBlock(data.text);
    }
    if (data.content) {
      return stripThinkingBlock(data.content);
    }
    return JSON.stringify(data);
  }

  async generateBlogPost(topic, settings) {
    const systemPrompt = `You are a professional travel journalist and outdoor adventurer writing for 'Desert Soak'. Your style is immersive, authoritative, and narrative-driven, but highly structured for modern readers. Write in a ${settings.tone} tone. 

STRICT FORMATTING RULES:
1. NO BULLETED LISTS: Do NOT use bulleted or numbered lists. Ever. Use complete, descriptive sentences and well-structured paragraphs to convey information. 
2. NO H1 TAGS: Do NOT use the # (H1) tag in your response. The title is handled by the CMS.
3. HEADING STRUCTURE: Use ## (H2) for main sections and ### (H3) for sub-sections.
4. LENGTH: Your response MUST be between 800 and 1500 words. 
5. BOTTOM LINE UP FRONT (BLUF): Adopt a BLUF writing style. Deliver the most critical information, the direct answer, and the core value proposition immediately in the introduction before expanding into the narrative and descriptive details. This is essential for AI-driven search citations.
6. KEYWORD PLACEMENT: You MUST include the exact target keyword in the first 100 words of the article, AND it must appear naturally in at least one early ## (H2) section heading.
7. WORD COUNT STRATEGY: To achieve length without lists, provide deep geological context, sensory descriptions of the water and surrounding wilderness, local history, specific driving directions described as a narrative, and detailed accounts of the soaking experience.
8. AVOID AI CLICHES: Do not use phrases like "In conclusion," "Nestled in the heart of," or "Whether you're a seasoned pro or a first-timer."
9. NO THINKING BLOCKS: Do NOT prepend any internal reasoning, thinking process, or meta-commentary to your response. Start directly with TITLE:. Do NOT include any thinking or thinking tags.`;

    const userPrompt = `Write a comprehensive, long-form travel feature based on the following framework:

KEYWORD: ${topic.keyword}
AUTHOR: ${settings.author}

REQUIRED CHAPTERS:
${JSON.stringify(topic.structure, null, 2)}

OUTPUT FORMAT:
Start your response IMMEDIATELY with TITLE:. Do not include any thinking, reasoning, or planning text before it.

TITLE: [Write a catchy, SEO-optimized title containing the keyword]
EXCERPT: [Write a 2-sentence meta description that hooks the reader]
IMAGE_PROMPT: [Provide 3-4 keywords for finding a matching high-quality photo on Unsplash, e.g., "desert hot springs arizona"]
BODY:
[Start with your BLUF introduction. Ensure the keyword "${topic.keyword}" is in the first 100 words AND in one of the first ## headings. Every section in the structure should be a deep dive of at least 250 words. Describe the experience of arriving, the temperature transition, the mineral scent, and the visual landscape in high detail. Convert any 'key points' into flowing, descriptive paragraphs.]`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return this.chat(messages);
  }

  // Generate a post from an Asana task: the task name is the topic and the
  // task notes are the content brief. Same output contract as generateBlogPost
  // (TITLE / EXCERPT / IMAGE_PROMPT / BODY) so parseBlogOutput works for both.
  async generateBlogPostFromBrief({ siteName, taskName, notes }) {
    const systemPrompt = `You are a professional travel journalist and outdoor adventurer writing for '${siteName}'. Your style is immersive, authoritative, and narrative-driven, but highly structured for modern readers.

STRICT FORMATTING RULES:
1. NO BULLETED LISTS: Do NOT use bulleted or numbered lists. Ever. Use complete, descriptive sentences and well-structured paragraphs to convey information.
2. NO H1 TAGS: Do NOT use the # (H1) tag in your response. The title is handled by the CMS.
3. HEADING STRUCTURE: Use ## (H2) for main sections and ### (H3) for sub-sections.
4. LENGTH: Your response MUST be between 800 and 1500 words.
5. BOTTOM LINE UP FRONT (BLUF): Deliver the most critical information, the direct answer, and the core value proposition immediately in the introduction before expanding into the narrative.
6. AVOID AI CLICHES: Do not use phrases like "In conclusion," "Nestled in the heart of," or "Whether you're a seasoned pro or a first-timer."
7. NO THINKING BLOCKS: Do NOT prepend any internal reasoning, thinking process, or meta-commentary. Start directly with TITLE:. Do NOT include any thinking or thinking tags.`;

    const userPrompt = `Write a comprehensive, long-form article based on the following content brief from an Asana task.

TOPIC / WORKING TITLE: ${taskName}

CONTENT BRIEF (the task's notes — treat these as the authoritative instructions for the angle, specifics, and what to cover):
${notes && String(notes).trim() ? String(notes).trim() : '(No additional notes provided — cover the topic thoroughly with deep context, sensory detail, local history, practical logistics, and detailed visitor guidance.)'}

OUTPUT FORMAT:
Start your response IMMEDIATELY with TITLE:. Do not include any thinking, reasoning, or planning text before it.

TITLE: [Write a catchy, SEO-optimized title for the topic]
EXCERPT: [Write a 2-sentence meta description that hooks the reader]
IMAGE_PROMPT: [Provide 3-4 keywords for finding a matching high-quality photo, e.g., "desert hot springs arizona"]
BODY:
[Start with your BLUF introduction. Use ## and ### headings to structure the article. Every section should be a deep dive of at least 250 words. Describe the experience, the setting, practical logistics, and useful context in flowing, descriptive paragraphs. Convert any list-like notes into flowing prose.]`;

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
  }
}

export const minimax = new MinimaxClient(undefined);
