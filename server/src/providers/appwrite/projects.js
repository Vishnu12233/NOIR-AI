// appwrite/projects.js — project + web platform management.
export async function getProject(aw, projectId) {
  const p = await aw.get('/v1/projects/' + encodeURIComponent(projectId));
  return { id: p.$id || p.id, name: p.name, createdAt: p.$createdAt || p.createdAt, status: p.status || 'active' };
}
// Console-credential operations (list/create projects inside an org)
export async function listProjectsConsole({ endpoint, consoleKey, organizationId }) {
  if (!consoleKey) return { requires_console: true, hint: 'Listing projects needs a console (organization-level) key.' };
  const aw = awClient({ endpoint, key: consoleKey });
  const org = organizationId || 'default';
  const r = await aw.get('/v1/console/organizations/' + encodeURIComponent(org) + '/projects').catch(() => aw.get('/v1/organizations/' + encodeURIComponent(org) + '/projects'));
  return (r.projects || []).map((p) => ({ id: p.$id || p.id, name: p.name }));
}
// Web platform (origin allow-list entry). Real POST to the project-scoped endpoint;
// falls back to the console-style path only on a definitive 404. Idempotent by id.
export async function ensureWebPlatform(aw, projectId, { hostname = 'localhost', platformId = null, name = 'Web' } = {}) {
  const pid = platformId || 'web';
  const existing = await listPlatforms(aw, projectId).catch(() => null);
  if (existing && (existing.platforms || []).some((p) => (p.$id || p.id) === pid)) return { existing: true, platformId: pid };
  const body = { platformId: pid, name, hostname: hostname || 'localhost' };
  try {
    await aw.post('/v1/projects/' + encodeURIComponent(projectId) + '/platforms/web', body);
  } catch (e) {
    if (e.status === 404) {
      try { await aw.post('/project/platforms/web', { ...body, projectId }); }
      catch (e2) { throw e2; } // real provider error
    } else throw e;
  }
  return { created: true, platformId: pid };
}
async function listPlatforms(aw, projectId) {
  try { return { platforms: (await aw.get('/v1/projects/' + encodeURIComponent(projectId) + '/platforms')).platforms || [] }; }
  catch (e) { if (e.status === 404) return { platforms: (await aw.get('/project/platforms')).platforms || [] }; throw e; }
}
