// vercel/deployments.js — create/get/poll/cancel/delete deployments (v13).
// Files are uploaded inline (base64 data) for real; larger projects fail loudly
// instead of guessing the upload API. URL/status always from the provider.
const MAX_INLINE_BYTES = 3.5 * 1024 * 1024;

export async function createDeployment(vc, { name, files, target = 'preview', projectId = null, projectSettings = {}, extraBody = {} }) {
  if (!files || !files.length) throw new Error('Vercel: nothing to upload — the bundle is empty.');
  const total = files.reduce((n, f) => n + String(f.data || '').length, 0);
  if (total > MAX_INLINE_BYTES) throw new Error('Vercel: bundle is ' + Math.round(total / 1024) + ' KB — the inline upload API accepts up to ~3.5 MB. Reduce assets (data files are excluded automatically) or add your own Vercel adapter project.');
  const body = {
    name: String(name).slice(0, 100),
    files: files.map((f) => ({ file: f.file, data: f.data })), // base64 inline
    target,
    ...(projectId ? { project: projectId } : {}),
    ...(Object.keys(projectSettings || {}).length ? { projectSettings } : {}),
    ...extraBody,
  };
  const d = await vc.post('/v13/deployments', body);
  return pubDeploy(d);
}

export function pubDeploy(d) {
  return {
    id: d.id || d.uid,
    url: d.url || null,
    alias: (d.alias || []).filter(Boolean)[0] || null,
    readyState: d.readyState || d.status || null,
    target: d.target || null,
    created: d.created || null,
    buildingAt: d.buildingAt || null,
    ready: d.ready || null,
    errorMessage: d.errorMessage || (d.readyState === 'ERROR' && d.error ? String(d.error).slice(0, 500) : null),
    meta: d.meta || null,
    inspectorUrl: d.inspectorUrl || null,
    projectId: d.projectId || null,
    name: d.name || null,
  };
}
export async function getDeployment(vc, idOrUrl) {
  return pubDeploy(await vc.get('/v13/deployments/' + encodeURIComponent(idOrUrl)));
}
export async function listDeployments(vc, { projectId, state, target, limit = 30 } = {}) {
  const q = [];
  if (projectId) q.push('projectId=' + encodeURIComponent(projectId));
  if (state) q.push('state=' + encodeURIComponent(state));
  if (target) q.push('target=' + encodeURIComponent(target));
  if (limit) q.push('limit=' + limit);
  const r = await vc.get('/v13/deployments', { query: q.join('&') });
  return { deployments: (r.deployments || []).map(pubDeploy), pagination: r.pagination || null };
}
export async function cancelDeployment(vc, id) {
  return pubDeploy(await vc.post('/v13/deployments/' + encodeURIComponent(id) + '/cancel', {}));
}
export async function deleteDeployment(vc, id) {
  await vc.del('/v13/deployments/' + encodeURIComponent(id));
  return { deleted: true };
}
