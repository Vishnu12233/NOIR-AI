// vercel/domains.js — real domain list + assignment.
export async function listDomains(vc) {
  const r = await vc.get('/v9/domains');
  return (r.domains || []).map((d) => ({ name: d.name, verified: !!d.verified, createdAt: d.createdAt }));
}
export async function addDomain(vc, projectIdOrName, name) {
  const r = await vc.post('/v9/projects/' + encodeURIComponent(projectIdOrName) + '/domains', { name });
  return { name, verified: !!r.verified, id: r.id || null };
}
