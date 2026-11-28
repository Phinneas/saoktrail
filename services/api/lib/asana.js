// services/api/lib/asana.js — minimal Asana REST client for the auto-poster.
// Uses a Personal Access Token (PAT). See https://developers.asana.com/reference.

const ASANA_API = 'https://app.asana.com/api/1.0';

// Only two kinds of task are picked up; everything else (ops, SEO chores, PDFs,
// reviews) is ignored by the autoposter. The prefix is stripped from the name.
//   "Article: <topic>" or "New page: <topic>"  -> write a new post
//   "Rewrite: <label>" or "Retrofit: <label>"  -> rewrite an existing post; its
//       /blog/<slug> URL goes in the name or notes
// An optional tag like "[PRIORITY]" before the colon is allowed and dropped.
// The Retrofit Plan style also works: the kind as a leading tag, then the label.
//   "[NEW PAGE] Sol Duc Hot Springs"          -> write a new post
//   "[RETROFIT] Goldmyer: spec block"         -> rewrite the matching post
// Other leading tags ([AUDIT], [TECH], ...) are not picked up.
const ARTICLE_PREFIX_RE = /^\s*(?:article|new page)\s*(?:\[[^\]]*\]\s*)?:\s*/i;
const REWRITE_PREFIX_RE = /^\s*(?:rewrite|retrofit)\s*(?:\[[^\]]*\]\s*)?:\s*/i;
const ARTICLE_TAG_RE = /^\s*(?:\[\s*priority\s*\]\s*)?\[\s*(?:article|new page)\s*\]\s*/i;
const REWRITE_TAG_RE = /^\s*(?:\[\s*priority\s*\]\s*)?\[\s*(?:rewrite|retrofit)\s*\]\s*/i;

// Which kind of task a name is, and the name with its prefix or tag removed.
export function taskKind(name) {
  const n = String(name || '');
  if (ARTICLE_PREFIX_RE.test(n)) return { kind: 'article', label: n.replace(ARTICLE_PREFIX_RE, '').trim() };
  if (REWRITE_PREFIX_RE.test(n)) return { kind: 'rewrite', label: n.replace(REWRITE_PREFIX_RE, '').trim() };
  if (ARTICLE_TAG_RE.test(n)) return { kind: 'article', label: n.replace(ARTICLE_TAG_RE, '').trim() };
  if (REWRITE_TAG_RE.test(n)) return { kind: 'rewrite', label: n.replace(REWRITE_TAG_RE, '').trim() };
  return { kind: null, label: n.trim() };
}

function authHeaders(pat) {
  return {
    Authorization: `Bearer ${pat}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// List incomplete "Article:" and "Rewrite:" tasks in one project, or several
// comma-separated project GIDs, paginated. Returns [{ gid, kind, name, notes, dueOn, priority }].
// We fetch all tasks and filter `!completed` client-side (Asana has no `completed=false`
// filter param; `completed_since` semantics are ambiguous across API versions).
export async function listOpenTasks(pat, projectGid) {
  if (!pat) throw new Error('ASANA_PAT not configured');
  const gids = String(projectGid || '').split(',').map((g) => g.trim()).filter(Boolean);
  if (gids.length === 0) return [];
  if (gids.length > 1) {
    const seen = new Set();
    const all = [];
    for (const gid of gids) {
      for (const t of await listOpenTasks(pat, gid)) {
        if (!seen.has(t.gid)) { seen.add(t.gid); all.push(t); }
      }
    }
    return all.sort((a, b) => Number(b.priority) - Number(a.priority));
  }

  const tasks = [];
  let offset = undefined;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({
      limit: '100',
      opt_fields: 'name,notes,due_on,completed',
      opt_pretty: 'false',
    });
    if (offset) params.set('offset', offset);

    const res = await fetch(
      `${ASANA_API}/projects/${projectGid}/tasks?${params.toString()}`,
      { headers: authHeaders(pat) }
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Asana list tasks failed (${res.status}): ${txt}`);
    }
    const data = await res.json();
    for (const t of data.data || []) {
      const name = t.name || '';
      const { kind, label } = taskKind(name);
      if (!t.completed && kind) {
        tasks.push({
          gid: t.gid,
          kind,
          name: label,
          notes: t.notes || '',
          dueOn: t.due_on || null,
          priority: /\[\s*priority\s*\]/i.test(name),
        });
      }
    }
    offset = data.next_page?.offset;
    if (!offset) break;
  }
  // [PRIORITY] tasks jump the queue. Otherwise keep Asana project order (stable sort).
  return tasks.sort((a, b) => Number(b.priority) - Number(a.priority));
}

// Mark a task complete. Uses the writable `completed` field on PUT /tasks/{gid}.
// Returns true on success, false on failure (caller logs and skips via dedup).
export async function markTaskComplete(pat, taskGid) {
  if (!pat || !taskGid) return false;
  const res = await fetch(`${ASANA_API}/tasks/${taskGid}`, {
    method: 'PUT',
    headers: authHeaders(pat),
    body: JSON.stringify({ data: { completed: true } }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`Asana markTaskComplete failed (${res.status}): ${txt}`);
    return false;
  }
  return true;
}

// Add a comment to a task (e.g. the retrofit fact-check table). Returns true on success.
export async function commentOnTask(pat, taskGid, text) {
  if (!pat || !taskGid || !text) return false;
  const res = await fetch(`${ASANA_API}/tasks/${taskGid}/stories`, {
    method: 'POST',
    headers: authHeaders(pat),
    body: JSON.stringify({ data: { text: String(text).slice(0, 60000) } }),
  });
  if (!res.ok) {
    console.error(`Asana comment failed (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
}
