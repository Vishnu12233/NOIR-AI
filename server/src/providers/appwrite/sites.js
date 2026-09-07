// appwrite/sites.js — Appwrite Sites: create site, upload deployment archive,
// poll status, fetch REAL build logs, activate/cancel/delete. States come from
// the provider verbatim (processing|waiting|building|ready|active|failed|canceled).
import { awMultipart } from './client.js';

export async function listSites(aw) {
  const r = await aw.get('/v1/sites');
  return { sites: (r.sites || []).map(pub) };
}
export async function createSite(aw, { siteId, name, adapter = 'static', enabled = true, logging = true, timeout = 30, installCommand, buildCommand, startCommand, outputDirectory, buildRuntime = 'node-20' }) {
  const body = {
    siteId: siteId || slug(name), name: String(name).slice(0, 100),
    adapter: adapter === 'ssr' ? 'ssr' : 'static', enabled, logging, timeout: Number(timeout) || 30,
    ...(installCommand ? { installCommand } : {}),
    ...(buildCommand ? { buildCommand } : {}),
    ...(startCommand ? { startCommand } : {}),
    ...(outputDirectory ? { outputDirectory } : {}),
    ...(adapter === 'ssr' ? { buildRuntime } : {}),
  };
  try {
    const s = await aw.post('/v1/sites', body);
    return pub(s, { created: true });
  } catch (e) {
    if (/already exists|duplicate/i.test(String(e.message))) {
      const list = await listSites(aw);
      const existing = list.sites.find((x) => x.id === body.siteId);
      if (existing) return pub(existing, { existing: true });
    }
    throw e;
  }
}
/** Upload a deployment. `codeArchive` = Buffer (tar.gz/zip). activate true when supported. */
export async function createDeployment(aw, siteId, codeArchive, { fileName = 'code.tar.gz', installCommand, buildCommand, startCommand, outputDirectory, activate = false } = {}) {
  const fields = {
    ...(installCommand ? { installCommand } : {}),
    ...(buildCommand ? { buildCommand } : {}),
    ...(startCommand ? { startCommand } : {}),
    ...(outputDirectory ? { outputDirectory } : {}),
    ...(activate ? { activate: 'true' } : {}),
  };
  const d = await awMultipart(aw, 'POST', '/v1/sites/' + encodeURIComponent(siteId) + '/deployments', fields, 'code', fileName, codeArchive);
  return pubDeploy(d);
}
export async function getDeployment(aw, siteId, deploymentId) {
  return pubDeploy(await aw.get('/v1/sites/' + encodeURIComponent(siteId) + '/deployments/' + encodeURIComponent(deploymentId)));
}
export async function listDeployments(aw, siteId) {
  const r = await aw.get('/v1/sites/' + encodeURIComponent(siteId) + '/deployments');
  return { deployments: (r.deployments || []).map(pubDeploy) };
}
export async function getSiteLogs(aw, siteId) {
  const r = await aw.get('/v1/sites/' + encodeURIComponent(siteId) + '/logs');
  const logs = Array.isArray(r) ? r : (r.logs || r.executions || []);
  return { logs: logs.map((l) => ({ ts: l.$createdAt || l.ts || null, text: l.text || l.message || l.output || JSON.stringify(l).slice(0, 300) })) };
}
export async function activateDeployment(aw, siteId, deploymentId) {
  try { await aw.patch('/v1/sites/' + encodeURIComponent(siteId) + '/deployments/' + encodeURIComponent(deploymentId), { activate: true }); return { activated: true }; }
  catch (e) { if (/not support|unknown|404/.test(String(e.message || '')) || e.status === 404) return { activated: false, note: 'This Appwrite build does not expose explicit activation — the deployment status governs availability.' }; throw e; }
}
export async function cancelDeployment(aw, siteId, deploymentId) {
  return aw.patch('/v1/sites/' + encodeURIComponent(siteId) + '/deployments/' + encodeURIComponent(deploymentId) + '/status', { status: 'canceled' });
}
export async function deleteDeployment(aw, siteId, deploymentId) {
  await aw.del('/v1/sites/' + encodeURIComponent(siteId) + '/deployments/' + encodeURIComponent(deploymentId));
  return { deleted: true };
}
const pub = (s, extra = {}) => ({ id: s.$id || s.id, name: s.name, status: s.status || null, framework: s.framework || null, adapter: s.adapter || null, url: s.url || s.domain || null, ...extra });
const pubDeploy = (d) => ({ id: d.$id || d.id, status: d.status || d.deploymentStatus || null, url: d.url || d.domain || null, createdAt: d.$createdAt || d.createdAt || null, size: d.size || null, failureReason: d.failureReason || d.error || null });
const slug = (s) => String(s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'x';
