// services/api/lib/asana.js — minimal Asana REST client for the auto-poster.
// Uses a Personal Access Token (PAT). See https://developers.asana.com/reference.

const ASANA_API = 'https://app.asana.com/api/1.0';

function authHeaders(pat) {
  return {
    Authorization: `Bearer ${pat}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// List all incomplete tasks in a project, paginated. Returns [{ gid, name, notes, dueOn }].
// We fetch all tasks and filter `!completed` client-side (Asana has no `completed=false`
// filter param; `completed_since` semantics are ambiguous across API versions).
export async function listOpenTasks(pat, projectGid) {
  if (!pat) throw new Error('ASANA_PAT not configured');
  if (!projectGid) return [];

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
      if (!t.completed) {
        tasks.push({
          gid: t.gid,
          name: t.name,
          notes: t.notes || '',
          dueOn: t.due_on || null,
        });
      }
    }
    offset = data.next_page?.offset;
    if (!offset) break;
  }
  return tasks;
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
