import { describe, expect, it } from 'vitest';
import { taskKind } from '../../lib/asana.js';
import { briefSlug, briefTitle, humanizeChecked, matchSlugByLabel } from '../scheduler';

describe('taskKind', () => {
  it('reads Retrofit Plan tags and the old prefixes', () => {
    expect(taskKind('[RETROFIT] Goldmyer: spec block')).toEqual({ kind: 'rewrite', label: 'Goldmyer: spec block' });
    expect(taskKind('[NEW PAGE] Sol Duc Hot Springs')).toEqual({ kind: 'article', label: 'Sol Duc Hot Springs' });
    expect(taskKind('Rewrite [PRIORITY]: /blog/x').kind).toBe('rewrite');
    expect(taskKind('New page: Foo').kind).toBe('article');
    expect(taskKind('[AUDIT] Scenic: find the page').kind).toBe(null);
  });
});

describe('matchSlugByLabel', () => {
  const slugs = ['goldmyer-hot-springs', 'baker-hot-springs-washington-state', 'sol-duc-hot-springs', 'soap-lake-hot-springs-washington', 'gamma-hot-springs', 'olympic-hot-springs-guide'];
  it('finds the single post a label names', () => {
    expect(matchSlugByLabel('Goldmyer: spec block', slugs)).toBe('goldmyer-hot-springs');
    expect(matchSlugByLabel('Baker: spec block', slugs)).toBe('baker-hot-springs-washington-state');
    expect(matchSlugByLabel('Sol Duc Hot Springs', slugs)).toBe('sol-duc-hot-springs');
  });
  it('refuses a vague or unmatched label', () => {
    expect(matchSlugByLabel('Gamma + Soap Lake: tighten titles', slugs)).toBe(null);
    expect(matchSlugByLabel('Scenic: build it', slugs)).toBe(null);
  });
});

describe('brief lines', () => {
  it('reads Slug and Title lines', () => {
    const notes = "Page plan\n\n    Title: 'Bonneville vs Carson vs TenZen: Columbia Gorge Hot Springs Compared'.\nSlug: /blog/bonneville-vs-carson-vs-tenzen";
    expect(briefSlug(notes)).toBe('bonneville-vs-carson-vs-tenzen');
    expect(briefTitle(notes)).toBe('Bonneville vs Carson vs TenZen: Columbia Gorge Hot Springs Compared');
  });
});

function envWith(reply: any, status = 200) {
  const sent: any[] = [];
  return {
    sent,
    env: {
      HUMANIZER_URL: 'https://h.example',
      HUMANIZER_API_KEY: 'k',
      HUMANIZER: { fetch: async (_u: any, init: any) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(reply), { status }); } },
    } as any,
  };
}

const BODY = 'Goldmyer costs $30 for adults and allows 20 people a day. The hike is 5 miles each way through old forest with a long gentle grade.\n\n## Sources\n\n- [Goldmyer](http://www.goldmyer.org/visiting.php)';

describe('humanizeChecked', () => {
  it('uses the humanized text and keeps the Sources section untouched', async () => {
    const { env, sent } = envWith({ text: 'Adults pay $30 at Goldmyer, and only 20 people get in each day. Plan on 5 miles each way through old forest on a gentle grade.', metrics: { preservation: { ok: true, missing: [] } } });
    const out = await humanizeChecked(env, BODY);
    expect(out.used).toBe(true);
    expect(sent[0].text).not.toContain('## Sources');
    expect(out.body).toContain('## Sources\n\n- [Goldmyer](http://www.goldmyer.org/visiting.php)');
  });
  it('rejects a pass that changes a number', async () => {
    const { env } = envWith({ text: 'Adults pay $35 at Goldmyer, and only 20 people get in each day. Plan on 5 miles each way through old forest on a gentle grade.', metrics: { preservation: { ok: true, missing: [] } } });
    const out = await humanizeChecked(env, BODY);
    expect(out.used).toBe(false);
    expect(out.body).toBe(BODY);
  });
  it('rejects a pass the humanizer flags as dropping tokens', async () => {
    const { env } = envWith({ text: 'x'.repeat(200), metrics: { preservation: { ok: false, missing: ['$30'] } } });
    expect((await humanizeChecked(env, BODY)).used).toBe(false);
  });
  it('falls back on an HTTP error', async () => {
    const { env } = envWith({}, 500);
    const out = await humanizeChecked(env, BODY);
    expect(out.used).toBe(false);
    expect(out.body).toBe(BODY);
  });
});
