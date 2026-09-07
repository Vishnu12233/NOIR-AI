// vercel/environment.js — real project environment variables (encrypted type on Vercel).
export async function listEnv(vc, projectIdOrName) {
  const r = await vc.get('/v9/projects/' + encodeURIComponent(projectIdOrName) + '/env');
  return (r.envs || r.env || []).map((e) => ({ id: e.id, key: e.key, target: e.target || [], type: e.type, createdAt: e.createdAt }));
}
export async function setEnv(vc, projectIdOrName, key, value, target = ['production', 'preview', 'development']) {
  const envs = await listEnv(vc, projectIdOrName).catch(() => []);
  const existing = envs.find((e) => e.key === key && JSON.stringify((e.target || []).sort()) === JSON.stringify([...target].sort()));
  if (existing) {
    await vc.patch('/v9/projects/' + encodeURIComponent(projectIdOrName) + '/env/' + existing.id, { key, value, target, type: 'encrypted' });
    return { updated: key };
  }
  await vc.post('/v9/projects/' + encodeURIComponent(projectIdOrName) + '/env', { key, value, target, type: 'encrypted' });
  return { created: key };
}
export async function deleteEnv(vc, projectIdOrName, envId) {
  await vc.del('/v9/projects/' + encodeURIComponent(projectIdOrName) + '/env/' + envId);
  return { deleted: true };
}
