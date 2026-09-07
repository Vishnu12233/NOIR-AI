// vercel/logs.js — REAL build logs: GET /v3/deployments/{id}/events (the same
// stream the Vercel CLI uses) + runtime logs endpoint.
export async function buildEvents(vc, deploymentId, { since = null, limit = 200 } = {}) {
  const q = ['direction=backward', 'limit=' + limit, 'follow=0'];
  if (since) q.push('since=' + since);
  const r = await vc.get('/v3/deployments/' + encodeURIComponent(deploymentId) + '/events', { query: q.join('&'), timeoutMs: 20000 });
  const arr = Array.isArray(r) ? r : (r.events || []);
  return {
    events: arr.map((e) => ({
      type: e.type,
      created: e.created ? Number(e.created) : null,
      text: (e.payload && (e.payload.text || (e.payload.info && JSON.stringify(e.payload.info)))) || '',
      deploymentId: e.payload && e.payload.deploymentId,
    })).filter((e) => e.text),
  };
}
export async function runtimeLogs(vc, projectId, deploymentId) {
  try {
    const r = await vc.get('/v1/projects/' + encodeURIComponent(projectId) + '/deployments/' + encodeURIComponent(deploymentId) + '/runtime-logs', { timeoutMs: 20000 });
    return { logs: String(r || '') };
  } catch (e) { return { logs: '', error: e.message }; }
}
export function parseEventText(e) {
  const t = e.text || '';
  try { if (t.startsWith('{')) { const j = JSON.parse(t); return j.text || j.payload?.text || ''; } } catch { /* raw line */ }
  return t;
}
